/**
 * MCP Server 入口（stdio）
 *
 * 注意：
 * - ChatOS 导入插件包时会默认排除 `node_modules/`，请在构建阶段把依赖 bundle 进产物。
 * - 日志写到 stderr，避免污染 MCP 通信的 stdout。
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import net from 'net';
import { Duplex } from 'stream';
import mysql from 'mysql2/promise';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const CONNECTIONS_FILENAME = 'connections.json';
const SECRET_FILENAME = 'secret.json';
const MCP_SELECTION_FILENAME = 'mcp-selection.json';
const MCP_EVENT_FILENAME = 'mcp-last-event.json';
const DEFAULT_PORT = 3306;

const ENCRYPTION = {
  algorithm: 'aes-256-gcm',
  keyBytes: 32,
  ivBytes: 12,
  tagBytes: 16,
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeConnectionType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mongodb') return 'mongo';
  if (!normalized) return 'mysql';
  return normalized;
};

const ensureConnectionType = (value) => {
  const normalized = normalizeConnectionType(value);
  if (normalized !== 'mysql' && normalized !== 'mongo') {
    throw new Error(`unsupported database type: ${value}`);
  }
  return normalized;
};

let mongoDriverPromise = null;

const loadMongoDriver = async () => {
  if (!mongoDriverPromise) {
    mongoDriverPromise = import('mongodb');
  }
  try {
    return await mongoDriverPromise;
  } catch (err) {
    mongoDriverPromise = null;
    const message = err?.message || String(err);
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || message.includes("Cannot find package 'mongodb'")) {
      throw new Error('未找到 MongoDB 驱动依赖：请在打包时将 mongodb bundle 进插件，或在 ChatOS 运行环境安装 mongodb。');
    }
    throw err;
  }
};

const sanitizeValue = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen));
  if (valueType === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeValue(item, seen);
    }
    seen.delete(value);
    return output;
  }
  return String(value);
};

const stableSort = (value) => {
  if (Array.isArray(value)) return value.map(stableSort);
  if (isPlainObject(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = stableSort(value[key]);
    }
    return output;
  }
  return value;
};

const stableStringify = (value) => JSON.stringify(stableSort(value));

const createEventId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

const hashConfig = (config) => {
  const payload = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || '',
    authType: config.authType || 'password',
    ssl: config.ssl || null,
    proxy: config.proxy || null,
    options: config.options || {},
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
};

const toolError = (message) => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const toolResponse = (payload) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
});

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
};

const writeJson = async (filePath, payload) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
};

const saveMcpEventSafe = async (dataDir, payload) => {
  if (!dataDir) return;
  try {
    const event = {
      id: createEventId(),
      at: new Date().toISOString(),
      ...payload,
    };
    await writeJson(path.join(dataDir, MCP_EVENT_FILENAME), event);
  } catch (err) {
    console.error('[mcp] failed to write event', err);
  }
};

const decryptJson = (key, payload) => {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, ENCRYPTION.ivBytes);
  const tag = buffer.subarray(ENCRYPTION.ivBytes, ENCRYPTION.ivBytes + ENCRYPTION.tagBytes);
  const encrypted = buffer.subarray(ENCRYPTION.ivBytes + ENCRYPTION.tagBytes);
  const decipher = crypto.createDecipheriv(ENCRYPTION.algorithm, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
};

const resolveDataDirCandidates = (extra) => {
  const meta = extra?._meta;
  const candidates = [];
  const pushCandidate = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };
  pushCandidate(meta?.workdir);
  pushCandidate(meta?.chatos?.uiApp?.dataDir);
  const stateDir = typeof meta?.chatos?.uiApp?.stateDir === 'string' ? meta.chatos.uiApp.stateDir.trim() : '';
  const pluginId = typeof meta?.chatos?.uiApp?.pluginId === 'string' ? meta.chatos.uiApp.pluginId.trim() : '';
  if (stateDir && pluginId) {
    pushCandidate(path.join(stateDir, 'ui_apps', 'data', pluginId));
  }
  const fallback = typeof process.env.CHATOS_DATA_DIR === 'string' ? process.env.CHATOS_DATA_DIR : '';
  pushCandidate(fallback);
  return candidates;
};

const loadSecretKey = async (dataDir) => {
  const secretPath = path.join(dataDir, SECRET_FILENAME);
  const secret = await readJson(secretPath, null);
  if (!secret?.key) throw new Error('secret key not found');
  const decoded = Buffer.from(secret.key, 'base64');
  if (decoded.length !== ENCRYPTION.keyBytes) {
    throw new Error('invalid encryption key');
  }
  return decoded;
};

const loadConnections = async (dataDir) => {
  const connectionsPath = path.join(dataDir, CONNECTIONS_FILENAME);
  const data = await readJson(connectionsPath, { items: [] });
  if (!data || !Array.isArray(data.items)) throw new Error('connections store is corrupted');
  return data.items;
};

const loadSelection = async (dataDir) => {
  const selectionPath = path.join(dataDir, MCP_SELECTION_FILENAME);
  const selection = await readJson(selectionPath, { connectionId: '', database: '' });
  return selection || { connectionId: '', database: '' };
};

const loadConnectionConfig = async (dataDir, connectionId) => {
  const connections = await loadConnections(dataDir);
  const record = connections.find((item) => item.id === connectionId);
  if (!record?.encrypted) throw new Error('connection not found');
  const key = await loadSecretKey(dataDir);
  const config = decryptJson(key, record.encrypted);
  if (!config || typeof config !== 'object') {
    throw new Error('connection config is corrupted');
  }
  const type = ensureConnectionType(config.type);
  if (!config.type) config.type = type;
  return { record, config, type };
};

const normalizeProxyInput = (input) => {
  if (!isPlainObject(input)) return { type: 'none' };
  const typeRaw = String(input.type || input.mode || input.proxyType || 'none').trim().toLowerCase();
  const type = ['none', 'http', 'socks5'].includes(typeRaw) ? typeRaw : 'none';
  if (type === 'none') return { type: 'none' };
  const host = String(input.host || '').trim();
  const portRaw = input.port == null || input.port === '' ? null : Number.parseInt(input.port, 10);
  const port = Number.isFinite(portRaw) ? portRaw : null;
  const username = String(input.username || input.user || '').trim();
  const password = input.password == null ? '' : String(input.password);
  return { type, host, port, username, password };
};

const readFileContent = async (label, filePath, encoding) => {
  if (!filePath) return null;
  try {
    if (typeof encoding === 'string') {
      return await fs.readFile(filePath, encoding);
    }
    return await fs.readFile(filePath);
  } catch (err) {
    throw new Error(`${label} file read failed (${filePath}): ${err?.message || String(err)}`);
  }
};

const buildSslOptions = async (config) => {
  if (config.ssl) {
    const ssl = {};
    const mode = config.ssl.mode || (config.ssl.pfxPath ? 'pfx' : 'keypair');
    if (mode === 'pfx') {
      const pfx = await readFileContent('PFX', config.ssl.pfxPath);
      if (pfx) ssl.pfx = pfx;
    } else {
      const ca = await readFileContent('CA', config.ssl.caPath, 'utf8');
      const cert = await readFileContent('Client cert', config.ssl.certPath, 'utf8');
      const key = await readFileContent('Client key', config.ssl.keyPath, 'utf8');
      if (ca) ssl.ca = ca;
      if (cert) ssl.cert = cert;
      if (key) ssl.key = key;
    }
    if (config.ssl.passphrase) ssl.passphrase = config.ssl.passphrase;
    if (Object.prototype.hasOwnProperty.call(config.ssl, 'rejectUnauthorized')) {
      ssl.rejectUnauthorized = config.ssl.rejectUnauthorized !== false;
    }
    return Object.keys(ssl).length > 0 ? ssl : undefined;
  }
  const rawSsl = config.options?.ssl;
  if (rawSsl === true) return {};
  if (isPlainObject(rawSsl)) return rawSsl;
  return undefined;
};

const toSocksAddress = (host) => {
  if (net.isIPv4(host)) {
    const parts = host.split('.').map((part) => Number.parseInt(part, 10));
    return { type: 0x01, buffer: Buffer.from(parts) };
  }
  if (net.isIPv6(host)) {
    const segments = host.split('::');
    const head = segments[0] ? segments[0].split(':') : [];
    const tail = segments[1] ? segments[1].split(':') : [];
    const missing = Math.max(0, 8 - (head.length + tail.length));
    const parts = [...head, ...Array.from({ length: missing }, () => '0'), ...tail];
    const buf = Buffer.alloc(16);
    parts.slice(0, 8).forEach((part, index) => {
      const value = Number.parseInt(part || '0', 16);
      buf.writeUInt16BE(value, index * 2);
    });
    return { type: 0x04, buffer: buf };
  }
  const name = Buffer.from(host);
  return { type: 0x03, buffer: Buffer.concat([Buffer.from([name.length]), name]) };
};

const createProxyStream = ({ proxy, target, connectTimeout }) => {
  const socket = net.connect(proxy.port, proxy.host);
  if (Number.isFinite(connectTimeout)) {
    socket.setTimeout(connectTimeout, () => {
      socket.destroy(new Error('Proxy connection timeout'));
    });
  }
  socket.setNoDelay(true);
  let ready = false;
  let handshakeState = proxy.type === 'http' ? 'http' : 'socks-method';
  let buffer = Buffer.alloc(0);
  const pendingWrites = [];

  const flushPending = (err) => {
    while (pendingWrites.length > 0) {
      const entry = pendingWrites.shift();
      if (err) {
        entry.callback(err);
      } else {
        socket.write(entry.chunk, entry.encoding, entry.callback);
      }
    }
  };

  const proxyStream = new Duplex({
    write(chunk, encoding, callback) {
      if (ready) {
        socket.write(chunk, encoding, callback);
      } else {
        pendingWrites.push({ chunk, encoding, callback });
      }
    },
    read() {},
    destroy(err, callback) {
      socket.destroy();
      callback(err);
    },
  });

  const handleReady = () => {
    ready = true;
    if (buffer.length > 0) {
      proxyStream.push(buffer);
      buffer = Buffer.alloc(0);
    }
    flushPending();
  };

  const handleError = (err) => {
    flushPending(err);
    proxyStream.destroy(err);
  };

  const handleHttpData = () => {
    const marker = buffer.indexOf('\r\n\r\n');
    if (marker === -1) return;
    const header = buffer.slice(0, marker).toString('utf8');
    const statusLine = header.split('\r\n')[0] || '';
    const match = statusLine.match(/HTTP\/\d+\.\d+\s+(\d+)/i);
    const status = match ? Number.parseInt(match[1], 10) : 0;
    if (status !== 200) {
      handleError(new Error(`Proxy CONNECT failed (${statusLine || 'no status'})`));
      return;
    }
    buffer = buffer.slice(marker + 4);
    handshakeState = 'ready';
    handleReady();
  };

  const handleSocksData = () => {
    const consume = (length) => {
      if (buffer.length < length) return null;
      const out = buffer.slice(0, length);
      buffer = buffer.slice(length);
      return out;
    };
    while (true) {
      if (handshakeState === 'socks-method') {
        const header = consume(2);
        if (!header) return;
        if (header[0] !== 0x05) {
          handleError(new Error('Invalid SOCKS5 response'));
          return;
        }
        if (header[1] === 0xff) {
          handleError(new Error('SOCKS5 authentication rejected'));
          return;
        }
        if (header[1] === 0x02) {
          const user = Buffer.from(proxy.username || '');
          const pass = Buffer.from(proxy.password || '');
          if (user.length > 255 || pass.length > 255) {
            handleError(new Error('SOCKS5 credentials too long'));
            return;
          }
          const authReq = Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]);
          socket.write(authReq);
          handshakeState = 'socks-auth';
          continue;
        }
        handshakeState = 'socks-request';
      }
      if (handshakeState === 'socks-auth') {
        const authResp = consume(2);
        if (!authResp) return;
        if (authResp[1] !== 0x00) {
          handleError(new Error('SOCKS5 authentication failed'));
          return;
        }
        handshakeState = 'socks-request';
      }
      if (handshakeState === 'socks-request') {
        const address = toSocksAddress(target.host);
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(target.port, 0);
        const req = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, address.type]), address.buffer, portBuf]);
        socket.write(req);
        handshakeState = 'socks-reply';
        continue;
      }
      if (handshakeState === 'socks-reply') {
        if (buffer.length < 4) return;
        const atyp = buffer[3];
        let replyLength = 0;
        if (atyp === 0x01) replyLength = 4 + 4 + 2;
        else if (atyp === 0x04) replyLength = 4 + 16 + 2;
        else if (atyp === 0x03) {
          if (buffer.length < 5) return;
          replyLength = 4 + 1 + buffer[4] + 2;
        } else {
          handleError(new Error('SOCKS5 proxy returned unknown address type'));
          return;
        }
        const reply = consume(replyLength);
        if (!reply) return;
        if (reply[1] !== 0x00) {
          handleError(new Error(`SOCKS5 connect failed (code ${reply[1]})`));
          return;
        }
        handshakeState = 'ready';
        handleReady();
        return;
      }
      return;
    }
  };

  socket.on('data', (chunk) => {
    if (ready) {
      proxyStream.push(chunk);
      return;
    }
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk);
    if (proxy.type === 'http') {
      handleHttpData();
    } else {
      handleSocksData();
    }
  });
  socket.on('end', () => proxyStream.push(null));
  socket.on('close', () => proxyStream.destroy());
  socket.on('error', (err) => handleError(err));

  socket.on('connect', () => {
    const hasAuth = Boolean(proxy.username || proxy.password);
    if (proxy.type === 'http') {
      const hostPort = `${target.host}:${target.port}`;
      const headers = [`CONNECT ${hostPort} HTTP/1.1`, `Host: ${hostPort}`];
      if (hasAuth) {
        const token = Buffer.from(`${proxy.username || ''}:${proxy.password || ''}`).toString('base64');
        headers.push(`Proxy-Authorization: Basic ${token}`);
      }
      headers.push('', '');
      socket.write(headers.join('\r\n'));
      return;
    }
    const methods = hasAuth ? [0x02] : [0x00];
    socket.write(Buffer.from([0x05, methods.length, ...methods]));
  });

  return proxyStream;
};

const buildPoolConfig = async (config) => {
  const options = isPlainObject(config.options) ? config.options : {};
  const ssl = await buildSslOptions(config);
  if (ssl) options.ssl = ssl;
  const poolConfig = {
    host: config.host,
    port: config.port || DEFAULT_PORT,
    user: config.user,
    password: config.password || '',
    database: config.database || undefined,
    ...options,
  };
  const proxy = normalizeProxyInput(config.proxy);
  if (proxy.type !== 'none') {
    if (!proxy.host || !Number.isInteger(proxy.port)) {
      throw new Error('proxy configuration is invalid');
    }
    poolConfig.stream = () =>
      createProxyStream({
        proxy,
        target: { host: config.host, port: config.port || DEFAULT_PORT },
        connectTimeout: options.connectTimeout,
      });
  }
  if (!poolConfig.database) delete poolConfig.database;
  return poolConfig;
};

const pools = new Map();

const getPoolForConnection = async (dataDir, connectionId, selectionDatabase) => {
  const { config, type } = await loadConnectionConfig(dataDir, connectionId);
  if (type !== 'mysql') {
    throw new Error('当前连接不是 MySQL，请使用 mongo.* 工具');
  }
  const database = String(selectionDatabase || config.database || '').trim();
  if (!database) throw new Error('database is not selected');
  const poolConfig = await buildPoolConfig({ ...config, database });
  const hash = hashConfig({ ...config, database });
  const cached = pools.get(connectionId);
  if (cached && cached.hash === hash) {
    return { pool: cached.pool, database };
  }
  if (cached) {
    try {
      await cached.pool.end();
    } catch (_) {
      // ignore pool close errors
    }
  }
  const pool = mysql.createPool(poolConfig);
  pools.set(connectionId, { pool, hash });
  return { pool, database };
};

const mongoClients = new Map();
const MONGO_OPTION_BLOCKLIST = new Set(['schemaSampleSize', 'sampleSize', 'schemaSample', 'sample']);

const splitMongoHosts = (value) =>
  String(value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeMongoHostsInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^mongodb(\+srv)?:\/\//i.test(raw)) return raw;
  return splitMongoHosts(raw).join(',');
};

const normalizeMongoTlsInput = (input) => {
  if (input == null) return { enabled: false };
  if (!isPlainObject(input)) return { enabled: Boolean(input) };
  const enabled = Boolean(input.enabled || input.caPath || input.certPath || input.keyPath);
  const caPath = String(input.caPath || input.ca || '').trim();
  const certPath = String(input.certPath || input.cert || '').trim();
  const keyPath = String(input.keyPath || input.key || '').trim();
  const passphrase = input.passphrase == null ? '' : String(input.passphrase);
  const rejectUnauthorized = Object.prototype.hasOwnProperty.call(input, 'rejectUnauthorized')
    ? Boolean(input.rejectUnauthorized)
    : true;
  return {
    enabled,
    caPath,
    certPath,
    keyPath,
    passphrase,
    rejectUnauthorized,
  };
};

const normalizeMongoOptions = (options) => {
  if (!isPlainObject(options)) return {};
  const output = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  return output;
};

const normalizeMongoConfig = (config, selectionDatabase) => ({
  type: 'mongo',
  name: String(config.name || '').trim(),
  hosts: normalizeMongoHostsInput(config.hosts ?? config.host ?? config.uri ?? ''),
  user: String(config.user || config.username || '').trim(),
  password: config.password == null ? '' : String(config.password),
  database: String(selectionDatabase || config.database || '').trim(),
  authSource: String(config.authSource || '').trim(),
  authMechanism: String(config.authMechanism || '').trim(),
  replicaSet: String(config.replicaSet || '').trim(),
  tls: normalizeMongoTlsInput(config.tls ?? config.ssl),
  options: normalizeMongoOptions(config.options ?? config.clientOptions ?? {}),
});

const filterMongoOptions = (options) => {
  const normalized = normalizeMongoOptions(options);
  const output = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (MONGO_OPTION_BLOCKLIST.has(key)) continue;
    output[key] = value;
  }
  return output;
};

const hashMongoConfig = (config) => {
  const payload = {
    type: 'mongo',
    hosts: config.hosts,
    user: config.user,
    password: config.password,
    database: config.database || '',
    authSource: config.authSource || '',
    authMechanism: config.authMechanism || '',
    replicaSet: config.replicaSet || '',
    tls: config.tls || null,
    options: config.options || {},
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
};

const resolveMongoUri = (config) => {
  const raw = String(config.hosts || '').trim();
  if (!raw) throw new Error('hosts is required');
  if (/^mongodb(\+srv)?:\/\//i.test(raw)) {
    return { uri: raw, usesRawUri: true };
  }
  const hosts = splitMongoHosts(raw);
  if (hosts.length === 0) throw new Error('hosts is required');
  let auth = '';
  if (config.user) {
    auth = encodeURIComponent(config.user);
    if (config.password != null) {
      auth += `:${encodeURIComponent(config.password)}`;
    }
    auth += '@';
  }
  const database = config.database ? `/${encodeURIComponent(config.database)}` : '';
  const params = new URLSearchParams();
  if (config.authSource) params.set('authSource', config.authSource);
  if (config.authMechanism) params.set('authMechanism', config.authMechanism);
  if (config.replicaSet) params.set('replicaSet', config.replicaSet);
  if (config.tls?.enabled) params.set('tls', 'true');
  const query = params.toString();
  const path = database || (query ? '/' : '');
  const suffix = query ? `?${query}` : '';
  return { uri: `mongodb://${auth}${hosts.join(',')}${path}${suffix}`, usesRawUri: false };
};

const buildMongoTlsOptions = async (config) => {
  const tls = normalizeMongoTlsInput(config.tls);
  if (!tls.enabled) return {};
  const options = { tls: true };
  if (tls.caPath) options.ca = await readFileContent('CA', tls.caPath);
  if (tls.certPath) options.cert = await readFileContent('Client cert', tls.certPath);
  if (tls.keyPath) options.key = await readFileContent('Client key', tls.keyPath);
  if (tls.passphrase) options.passphrase = tls.passphrase;
  if (Object.prototype.hasOwnProperty.call(tls, 'rejectUnauthorized')) {
    options.rejectUnauthorized = tls.rejectUnauthorized !== false;
    if (tls.rejectUnauthorized === false) {
      options.tlsAllowInvalidCertificates = true;
    }
  }
  return options;
};

const buildMongoClientOptions = async (config, usesRawUri) => {
  const options = filterMongoOptions(config.options);
  const tlsOptions = await buildMongoTlsOptions(config);
  Object.assign(options, tlsOptions);
  if (config.authSource) options.authSource = config.authSource;
  if (config.authMechanism) options.authMechanism = config.authMechanism;
  if (config.replicaSet) options.replicaSet = config.replicaSet;
  if (usesRawUri && config.user) {
    options.auth = { username: config.user, password: config.password };
  }
  return options;
};

const getMongoClientForConnection = async (dataDir, connectionId, selectionDatabase) => {
  const { config, type } = await loadConnectionConfig(dataDir, connectionId);
  if (type !== 'mongo') {
    throw new Error('当前连接不是 MongoDB，请使用 mysql.* 工具');
  }
  const normalized = normalizeMongoConfig(config, selectionDatabase);
  if (!normalized.hosts) throw new Error('hosts is required');
  const { uri, usesRawUri } = resolveMongoUri(normalized);
  const options = await buildMongoClientOptions(normalized, usesRawUri);
  const hash = hashMongoConfig(normalized);
  const cached = mongoClients.get(connectionId);
  if (cached && cached.hash === hash) {
    return { client: cached.client, database: normalized.database };
  }
  if (cached) {
    try {
      await cached.client.close();
    } catch (_) {
      // ignore close errors
    }
  }
  const { MongoClient } = await loadMongoDriver();
  const client = new MongoClient(uri, options);
  client.__dataAppDefaultDb = normalized.database || '';
  await client.connect();
  mongoClients.set(connectionId, { client, hash });
  return { client, database: normalized.database };
};

const isBsonValue = (value) => Boolean(value) && typeof value === 'object' && typeof value._bsontype === 'string';

const formatBsonValue = (value) => {
  const type = value?._bsontype;
  if (!type) return String(value);
  if (type === 'ObjectId' && typeof value.toHexString === 'function') return value.toHexString();
  if (type === 'Binary') {
    if (value.buffer) return Buffer.from(value.buffer).toString('base64');
    if (typeof value.value === 'function') {
      const buf = value.value(true);
      return Buffer.from(buf).toString('base64');
    }
  }
  if (typeof value.toString === 'function') return value.toString();
  return String(value);
};

const sanitizeMongoValue = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (isBsonValue(value)) return formatBsonValue(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitizeMongoValue(item, seen));
  if (valueType === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeMongoValue(item, seen);
    }
    seen.delete(value);
    return output;
  }
  return String(value);
};

const parseMongoQuery = (sql) => {
  const trimmed = String(sql || '').trim();
  if (!trimmed) throw new Error('查询内容为空');
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error('Mongo 查询目前仅支持 JSON 格式，例如: { \"collection\": \"users\", \"action\": \"find\", \"filter\": {} }');
  }
};

const resolveMongoDatabase = (client, payload) => {
  const name = String(payload?.database || payload?.db || '').trim();
  if (name) return client.db(name);
  const fallback = String(client?.__dataAppDefaultDb || '').trim();
  if (fallback) return client.db(fallback);
  return client.db();
};

const executeMongoQuery = async (client, sql) => {
  const payload = parseMongoQuery(sql);
  if (!isPlainObject(payload)) throw new Error('Mongo 查询必须是 JSON 对象');
  const db = resolveMongoDatabase(client, payload);

  if (payload.command) {
    const command = payload.command;
    let commandDoc;
    if (typeof command === 'string') {
      const extra = isPlainObject(payload.commandOptions) ? payload.commandOptions : {};
      commandDoc = { [command]: 1, ...extra };
    } else if (isPlainObject(command)) {
      commandDoc = command;
    } else {
      throw new Error('command 必须是字符串或对象');
    }
    const result = await db.command(commandDoc);
    return { rows: [sanitizeMongoValue(result)] };
  }

  const collectionName = String(payload.collection || payload.table || payload.name || '').trim();
  if (!collectionName) throw new Error('collection is required');
  const collection = db.collection(collectionName);
  const options = isPlainObject(payload.options) ? payload.options : {};
  let action = String(payload.action || payload.op || payload.method || '').trim().toLowerCase();
  if (!action) action = Array.isArray(payload.pipeline) ? 'aggregate' : 'find';

  if (action === 'find') {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const projection = isPlainObject(payload.projection) ? payload.projection : undefined;
    let cursor = collection.find(filter, { ...options, projection });
    if (isPlainObject(payload.sort)) cursor = cursor.sort(payload.sort);
    if (Number.isFinite(Number(payload.skip))) cursor = cursor.skip(Number(payload.skip));
    if (Number.isFinite(Number(payload.limit))) cursor = cursor.limit(Number(payload.limit));
    const docs = await cursor.toArray();
    return { rows: sanitizeMongoValue(docs) };
  }

  if (action === 'findone') {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const projection = isPlainObject(payload.projection) ? payload.projection : undefined;
    const sort = isPlainObject(payload.sort) ? payload.sort : undefined;
    const doc = await collection.findOne(filter, { ...options, projection, sort });
    return { rows: doc ? [sanitizeMongoValue(doc)] : [] };
  }

  if (action === 'aggregate') {
    if (!Array.isArray(payload.pipeline)) throw new Error('pipeline must be an array');
    const docs = await collection.aggregate(payload.pipeline, options).toArray();
    return { rows: sanitizeMongoValue(docs) };
  }

  if (action === 'insertone') {
    if (!isPlainObject(payload.document)) throw new Error('document is required');
    const result = await collection.insertOne(payload.document, options);
    const summary = { ...sanitizeMongoValue(result), affectedRows: result?.acknowledged ? 1 : 0 };
    return { rows: summary };
  }

  if (action === 'insertmany') {
    if (!Array.isArray(payload.documents)) throw new Error('documents must be an array');
    const result = await collection.insertMany(payload.documents, options);
    const summary = { ...sanitizeMongoValue(result), affectedRows: result?.insertedCount ?? 0 };
    return { rows: summary };
  }

  if (action === 'updateone' || action === 'updatemany') {
    if (!isPlainObject(payload.update) && !Array.isArray(payload.update)) {
      throw new Error('update is required');
    }
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const method = action === 'updateone' ? 'updateOne' : 'updateMany';
    const result = await collection[method](filter, payload.update, options);
    const modified = Number(result?.modifiedCount ?? 0);
    const upserted = Number(result?.upsertedCount ?? 0);
    const summary = { ...sanitizeMongoValue(result), affectedRows: modified + upserted };
    return { rows: summary };
  }

  if (action === 'deleteone' || action === 'deletemany') {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const method = action === 'deleteone' ? 'deleteOne' : 'deleteMany';
    const result = await collection[method](filter, options);
    const summary = { ...sanitizeMongoValue(result), affectedRows: result?.deletedCount ?? 0 };
    return { rows: summary };
  }

  if (action === 'count') {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const count = await collection.countDocuments(filter, options);
    return { rows: [{ count }] };
  }

  if (action === 'distinct') {
    const field = String(payload.field || '').trim();
    if (!field) throw new Error('field is required');
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const values = await collection.distinct(field, filter, options);
    return { rows: values.map((value) => ({ value: sanitizeMongoValue(value) })) };
  }

  throw new Error(`unsupported action: ${action}`);
};

const resolveActiveSelection = async (extra) => {
  const candidates = resolveDataDirCandidates(extra);
  if (candidates.length === 0) {
    throw new Error('dataDir is required (missing MCP callMeta.workdir)');
  }
  let lastDatabase = '';
  for (const dataDir of candidates) {
    const selection = await loadSelection(dataDir);
    const connectionId = String(selection?.connectionId || '').trim();
    const database = String(selection?.database || '').trim();
    if (database) {
      lastDatabase = database;
    }
    if (connectionId) {
      return { dataDir, connectionId, database };
    }
  }
  const error = new Error('no active connection selected in the app');
  error.details = {
    candidates,
    database: lastDatabase || '',
  };
  throw error;
};

const server = new McpServer({
  name: 'data-app-mcp-server',
  version: '0.3.0',
});

server.registerTool(
  'mysql.schema.listTables',
  {
    description: 'List tables in the selected database',
    inputSchema: {
      database: z.string().optional(),
      includeViews: z.boolean().optional(),
    },
  },
  async ({ database, includeViews }, extra) => {
    let dataDir = '';
    let connectionId = '';
    let resolvedDatabase = '';
    try {
      const selection = await resolveActiveSelection(extra);
      dataDir = selection.dataDir;
      connectionId = selection.connectionId;
      const selectedDatabase = selection.database;
      const requestedDatabase = typeof database === 'string' ? database.trim() : '';
      const poolResult = await getPoolForConnection(
        dataDir,
        connectionId,
        requestedDatabase || selectedDatabase
      );
      const pool = poolResult.pool;
      resolvedDatabase = poolResult.database;
      const includeViewsFlag = includeViews !== false;
      const typeFilter = includeViewsFlag ? '' : "AND TABLE_TYPE = 'BASE TABLE'";
      const startedAt = Date.now();
      const [rows] = await pool.query(
        `SELECT TABLE_NAME AS name,
                TABLE_TYPE AS type,
                ENGINE AS engine,
                TABLE_ROWS AS rows,
                TABLE_COMMENT AS comment
         FROM information_schema.tables
         WHERE TABLE_SCHEMA = ?
         ${typeFilter}
         ORDER BY TABLE_NAME`,
        [resolvedDatabase]
      );
      const durationMs = Date.now() - startedAt;
      const tables = Array.isArray(rows)
        ? rows
            .map((row) => ({
              name: String(row?.name ?? '').trim(),
              type: row?.type ?? '',
              engine: row?.engine ?? '',
              rows: row?.rows ?? null,
              comment: row?.comment ?? '',
            }))
            .filter((item) => item.name)
        : [];
      await saveMcpEventSafe(dataDir, {
        tool: 'mysql.schema.listTables',
        connectionId,
        database: resolvedDatabase,
        result: {
          rows: sanitizeValue(tables),
          fields: null,
          durationMs,
          rowCount: tables.length,
        },
      });
      return toolResponse({
        connectionId,
        database: resolvedDatabase,
        tables: sanitizeValue(tables),
        count: tables.length,
      });
    } catch (error) {
      await saveMcpEventSafe(dataDir, {
        tool: 'mysql.schema.listTables',
        connectionId,
        database: resolvedDatabase,
        error: { message: error?.message || 'failed to list tables' },
      });
      return toolError(error?.message || 'failed to list tables');
    }
  }
);

server.registerTool(
  'mysql.query.execute',
  {
    description: 'Execute a SQL query using the connection selected in the app',
    inputSchema: {
      sql: z.string().min(1),
      params: z.array(z.any()).optional(),
    },
  },
  async ({ sql, params }, extra) => {
    let dataDir = '';
    let connectionId = '';
    let database = '';
    try {
      const selection = await resolveActiveSelection(extra);
      dataDir = selection.dataDir;
      connectionId = selection.connectionId;
      const selectedDatabase = selection.database;
      const poolResult = await getPoolForConnection(dataDir, connectionId, selectedDatabase);
      const pool = poolResult.pool;
      database = poolResult.database;
      const startedAt = Date.now();
      const [rows, fields] = await pool.query(sql, Array.isArray(params) ? params : []);
      const durationMs = Date.now() - startedAt;
      const rowCount = Array.isArray(rows) ? rows.length : Number(rows?.affectedRows ?? 0);
      await saveMcpEventSafe(dataDir, {
        tool: 'mysql.query.execute',
        connectionId,
        database,
        sql,
        params: sanitizeValue(Array.isArray(params) ? params : []),
        result: {
          rows: sanitizeValue(rows),
          fields: sanitizeValue(fields),
          durationMs,
          rowCount,
        },
      });
      return toolResponse({
        connectionId,
        database,
        rows: sanitizeValue(rows),
        fields: sanitizeValue(fields),
        durationMs,
        rowCount,
      });
    } catch (error) {
      await saveMcpEventSafe(dataDir, {
        tool: 'mysql.query.execute',
        connectionId,
        database,
        sql,
        params: sanitizeValue(Array.isArray(params) ? params : []),
        error: { message: error?.message || 'failed to execute query' },
      });
      return toolError(error?.message || 'failed to execute query');
    }
  }
);

server.registerTool(
  'mongo.schema.listTables',
  {
    description: 'List collections in the selected database',
    inputSchema: {
      database: z.string().optional(),
    },
  },
  async ({ database }, extra) => {
    let dataDir = '';
    let connectionId = '';
    let resolvedDatabase = '';
    try {
      const selection = await resolveActiveSelection(extra);
      dataDir = selection.dataDir;
      connectionId = selection.connectionId;
      const selectedDatabase = selection.database;
      const requestedDatabase = typeof database === 'string' ? database.trim() : '';
      const clientResult = await getMongoClientForConnection(
        dataDir,
        connectionId,
        requestedDatabase || selectedDatabase
      );
      const client = clientResult.client;
      resolvedDatabase = clientResult.database;
      if (!resolvedDatabase) throw new Error('database is not selected');
      const startedAt = Date.now();
      const collections = await client
        .db(resolvedDatabase)
        .listCollections({}, { nameOnly: false })
        .toArray();
      const durationMs = Date.now() - startedAt;
      const tables = Array.isArray(collections)
        ? collections.map((item) => ({
            name: item.name,
            type: item.type || 'collection',
            options: item.options,
            info: item.info,
          }))
        : [];
      await saveMcpEventSafe(dataDir, {
        tool: 'mongo.schema.listTables',
        connectionId,
        database: resolvedDatabase,
        result: {
          rows: sanitizeMongoValue(tables),
          fields: null,
          durationMs,
          rowCount: tables.length,
        },
      });
      return toolResponse({
        connectionId,
        database: resolvedDatabase,
        tables: sanitizeMongoValue(tables),
        count: tables.length,
      });
    } catch (error) {
      await saveMcpEventSafe(dataDir, {
        tool: 'mongo.schema.listTables',
        connectionId,
        database: resolvedDatabase,
        error: { message: error?.message || 'failed to list collections' },
      });
      return toolError(error?.message || 'failed to list collections');
    }
  }
);

server.registerTool(
  'mongo.query.execute',
  {
    description: 'Execute a MongoDB query (JSON) using the connection selected in the app',
    inputSchema: {
      sql: z.string().optional(),
      query: z.string().optional(),
    },
  },
  async ({ sql, query }, extra) => {
    let dataDir = '';
    let connectionId = '';
    let database = '';
    let sqlText = '';
    try {
      const selection = await resolveActiveSelection(extra);
      dataDir = selection.dataDir;
      connectionId = selection.connectionId;
      const selectedDatabase = selection.database;
      sqlText = typeof sql === 'string' && sql.trim() ? sql : typeof query === 'string' ? query : '';
      if (!sqlText.trim()) throw new Error('sql is required');
      const clientResult = await getMongoClientForConnection(dataDir, connectionId, selectedDatabase);
      const client = clientResult.client;
      database = clientResult.database;
      const startedAt = Date.now();
      const { rows, fields } = await executeMongoQuery(client, sqlText);
      const durationMs = Date.now() - startedAt;
      const rowCount = Array.isArray(rows) ? rows.length : Number(rows?.affectedRows ?? 0);
      await saveMcpEventSafe(dataDir, {
        tool: 'mongo.query.execute',
        connectionId,
        database,
        sql: sqlText,
        result: {
          rows: sanitizeMongoValue(rows),
          fields: sanitizeMongoValue(fields),
          durationMs,
          rowCount,
        },
      });
      return toolResponse({
        connectionId,
        database,
        rows: sanitizeMongoValue(rows),
        fields: sanitizeMongoValue(fields),
        durationMs,
        rowCount,
      });
    } catch (error) {
      await saveMcpEventSafe(dataDir, {
        tool: 'mongo.query.execute',
        connectionId,
        database,
        sql: sqlText,
        error: { message: error?.message || 'failed to execute query' },
      });
      return toolError(error?.message || 'failed to execute query');
    }
  }
);

server.registerTool(
  'app.selection.get',
  {
    description: 'Get current selected connection info (type/name/database)',
    inputSchema: {},
  },
  async (_, extra) => {
    let dataDir = '';
    let connectionId = '';
    let database = '';
    try {
      const selection = await resolveActiveSelection(extra);
      dataDir = selection.dataDir;
      connectionId = selection.connectionId;
      database = selection.database;
      const { config, type } = await loadConnectionConfig(dataDir, connectionId);
      const payload = {
        connectionId,
        type,
        name: String(config.name || '').trim(),
        database,
        defaultDatabase: String(config.database || '').trim(),
      };
      if (type === 'mysql') {
        payload.host = String(config.host || '').trim();
        payload.port = config.port ?? DEFAULT_PORT;
        payload.user = String(config.user || '').trim();
      } else if (type === 'mongo') {
        payload.hosts = String(config.hosts || config.host || '').trim();
        payload.user = String(config.user || '').trim();
      }
      await saveMcpEventSafe(dataDir, {
        tool: 'app.selection.get',
        connectionId,
        database,
        result: {
          rows: sanitizeValue(payload),
          fields: null,
          durationMs: 0,
          rowCount: 1,
        },
      });
      return toolResponse(payload);
    } catch (error) {
      await saveMcpEventSafe(dataDir, {
        tool: 'app.selection.get',
        connectionId,
        database,
        error: { message: error?.message || 'failed to load selection' },
      });
      return toolError(error?.message || 'failed to load selection');
    }
  }
);

const start = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] Data App MCP server started (stdio)');
};

start().catch((error) => {
  console.error('[mcp] server error', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  try {
    for (const pool of pools.values()) {
      await pool.pool.end();
    }
    for (const client of mongoClients.values()) {
      await client.client.close();
    }
    await server.close();
  } catch (error) {
    console.error('[mcp] shutdown error', error);
  } finally {
    process.exit(0);
  }
});
