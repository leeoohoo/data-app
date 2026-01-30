import fs from "fs/promises";
import crypto from "crypto";
import net from "net";
import { Duplex } from "stream";
import mysql from "mysql2/promise";
import { isPlainObject, stableStringify } from "../lib/utils.mjs";

const TYPE = "mysql";
const DEFAULT_PORT = 3306;
const DEFAULT_AUTH_TYPE = "password";
const AUTH_TYPES = new Set(["password", "certificate"]);
const PROXY_TYPES = new Set(["none", "http", "socks5"]);

const DEFAULT_POOL_OPTIONS = {
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const ALLOWED_OPTION_KEYS = new Set([
  "waitForConnections",
  "connectionLimit",
  "queueLimit",
  "connectTimeout",
  "enableKeepAlive",
  "keepAliveInitialDelay",
  "multipleStatements",
  "charset",
  "timezone",
  "ssl",
  "namedPlaceholders",
  "rowsAsArray",
  "supportBigNumbers",
  "bigNumberStrings",
  "dateStrings",
  "decimalNumbers",
]);

const normalizeOptions = (options) => {
  if (!isPlainObject(options)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) continue;
    if (value === undefined) continue;
    if (["connectionLimit", "queueLimit", "connectTimeout", "keepAliveInitialDelay"].includes(key)) {
      const num = Number.parseInt(value, 10);
      if (Number.isFinite(num)) normalized[key] = num;
      continue;
    }
    if (["waitForConnections", "enableKeepAlive", "multipleStatements", "namedPlaceholders", "rowsAsArray"].includes(key)) {
      if (typeof value === "boolean") normalized[key] = value;
      continue;
    }
    if (["supportBigNumbers", "bigNumberStrings", "dateStrings", "decimalNumbers"].includes(key)) {
      if (typeof value === "boolean") normalized[key] = value;
      continue;
    }
    if (key === "ssl") {
      if (typeof value === "boolean" || isPlainObject(value)) normalized[key] = value;
      continue;
    }
    if (typeof value === "string") normalized[key] = value;
  }
  return normalized;
};

const normalizeAuthType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return AUTH_TYPES.has(normalized) ? normalized : DEFAULT_AUTH_TYPE;
};

const normalizeSslInput = (input) => {
  if (!isPlainObject(input)) return null;
  const modeRaw = String(input.mode || "").trim().toLowerCase();
  const mode = modeRaw === "pfx" ? "pfx" : modeRaw === "keypair" ? "keypair" : "";
  const caPath = String(input.caPath || input.ca || "").trim();
  const certPath = String(input.certPath || input.cert || "").trim();
  const keyPath = String(input.keyPath || input.key || "").trim();
  const pfxPath = String(input.pfxPath || input.pfx || "").trim();
  const passphrase = input.passphrase == null ? "" : String(input.passphrase);
  const rejectUnauthorized = Object.prototype.hasOwnProperty.call(input, "rejectUnauthorized")
    ? Boolean(input.rejectUnauthorized)
    : true;
  if (
    !mode &&
    !caPath &&
    !certPath &&
    !keyPath &&
    !pfxPath &&
    !passphrase &&
    !Object.prototype.hasOwnProperty.call(input, "rejectUnauthorized")
  ) {
    return null;
  }
  return {
    mode: mode || (pfxPath ? "pfx" : "keypair"),
    caPath,
    certPath,
    keyPath,
    pfxPath,
    passphrase,
    rejectUnauthorized,
  };
};

const normalizeProxyInput = (input) => {
  if (!isPlainObject(input)) {
    return { type: "none" };
  }
  const typeRaw = String(input.type || input.mode || input.proxyType || "none").trim().toLowerCase();
  const type = PROXY_TYPES.has(typeRaw) ? typeRaw : "none";
  if (type === "none") {
    return { type: "none" };
  }
  const host = String(input.host || "").trim();
  const portRaw = input.port == null || input.port === "" ? null : Number.parseInt(input.port, 10);
  const port = Number.isFinite(portRaw) ? portRaw : null;
  const username = String(input.username || input.user || "").trim();
  const password = input.password == null ? "" : String(input.password);
  return {
    type,
    host,
    port,
    username,
    password,
  };
};

const normalizeConfigInput = (input) => {
  if (!isPlainObject(input)) throw new Error("config is required");
  const rawType = String(input.type || "").trim().toLowerCase();
  if (rawType && rawType !== TYPE) {
    throw new Error(`unsupported database type: ${input.type}`);
  }
  const name = String(input.name || "").trim();
  const host = String(input.host || "").trim();
  const user = String(input.user || input.username || "").trim();
  const password = input.password == null ? "" : String(input.password);
  const database = input.database == null ? "" : String(input.database).trim();
  const rawPort = input.port == null || input.port === "" ? DEFAULT_PORT : Number.parseInt(input.port, 10);
  if (!Number.isFinite(rawPort) || rawPort <= 0 || rawPort > 65535) {
    throw new Error("port must be a valid number");
  }
  const authType = normalizeAuthType(input.authType);
  const ssl = normalizeSslInput(input.ssl ?? input.tls);
  const proxy = normalizeProxyInput(input.proxy ?? input.proxyConfig);
  const options = normalizeOptions(input.options ?? input.pool ?? {});
  return {
    type: TYPE,
    name,
    host,
    port: rawPort,
    user,
    password,
    database,
    authType,
    ssl,
    proxy,
    options,
  };
};

const mergeOptions = (base, patch) => {
  if (patch === null) return {};
  const normalized = normalizeOptions(patch ?? {});
  return { ...(base || {}), ...normalized };
};

const mergeConfig = (base, patch) => {
  if (!isPlainObject(patch)) return { ...base, type: TYPE };
  const next = { ...base, type: TYPE };
  if (Object.prototype.hasOwnProperty.call(patch, "type")) {
    const rawType = String(patch.type || "").trim().toLowerCase();
    if (rawType && rawType !== TYPE) {
      throw new Error("changing database type is not supported");
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    next.name = String(patch.name || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "host")) {
    next.host = String(patch.host || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "port")) {
    const rawPort = patch.port == null || patch.port === "" ? DEFAULT_PORT : Number.parseInt(patch.port, 10);
    if (!Number.isFinite(rawPort) || rawPort <= 0 || rawPort > 65535) {
      throw new Error("port must be a valid number");
    }
    next.port = rawPort;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "user") || Object.prototype.hasOwnProperty.call(patch, "username")) {
    next.user = String(patch.user || patch.username || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "password")) {
    next.password = patch.password == null ? "" : String(patch.password);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "database")) {
    next.database = patch.database == null ? "" : String(patch.database).trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "authType")) {
    next.authType = normalizeAuthType(patch.authType);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "ssl") || Object.prototype.hasOwnProperty.call(patch, "tls")) {
    const rawSsl = patch.ssl ?? patch.tls;
    const hasPassphrase = isPlainObject(rawSsl) && Object.prototype.hasOwnProperty.call(rawSsl, "passphrase");
    const normalized = normalizeSslInput(rawSsl);
    if (normalized === null) {
      next.ssl = null;
    } else {
      const baseSsl = isPlainObject(next.ssl) ? next.ssl : {};
      next.ssl = { ...baseSsl, ...normalized };
      if (!hasPassphrase && baseSsl.passphrase) {
        next.ssl.passphrase = baseSsl.passphrase;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "proxy") || Object.prototype.hasOwnProperty.call(patch, "proxyConfig")) {
    const rawProxy = patch.proxy ?? patch.proxyConfig;
    const hasProxyPassword = isPlainObject(rawProxy) && Object.prototype.hasOwnProperty.call(rawProxy, "password");
    const normalized = normalizeProxyInput(rawProxy);
    if (!hasProxyPassword && normalized.type !== "none") {
      const baseProxy = normalizeProxyInput(next.proxy);
      if (baseProxy.password) {
        normalized.password = baseProxy.password;
      }
    }
    next.proxy = normalized;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "options") || Object.prototype.hasOwnProperty.call(patch, "pool")) {
    next.options = mergeOptions(next.options, patch.options ?? patch.pool ?? {});
  }
  return next;
};

const validateConfig = (config) => {
  if (!config.name) throw new Error("name is required");
  if (!config.host) throw new Error("host is required");
  if (!config.user) throw new Error("user is required");
  if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error("port must be a valid number");
  }
  const authType = normalizeAuthType(config.authType);
  if (authType === "certificate") {
    if (!config.ssl) {
      throw new Error("certificate auth requires ssl config");
    }
    const sslMode = config.ssl.mode || (config.ssl.pfxPath ? "pfx" : "keypair");
    if (sslMode === "pfx") {
      if (!config.ssl.pfxPath) {
        throw new Error("certificate auth requires pfxPath");
      }
    } else if (!config.ssl.certPath || !config.ssl.keyPath) {
      throw new Error("certificate auth requires certPath and keyPath");
    }
  }
  const proxy = normalizeProxyInput(config.proxy);
  if (proxy.type !== "none") {
    if (!proxy.host) throw new Error("proxy host is required");
    if (!Number.isInteger(proxy.port) || proxy.port <= 0 || proxy.port > 65535) {
      throw new Error("proxy port must be a valid number");
    }
  }
};

const readFileContent = async (label, filePath, encoding) => {
  if (!filePath) return null;
  try {
    if (typeof encoding === "string") {
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
    const mode = config.ssl.mode || (config.ssl.pfxPath ? "pfx" : "keypair");
    if (mode === "pfx") {
      const pfx = await readFileContent("PFX", config.ssl.pfxPath);
      if (pfx) ssl.pfx = pfx;
    } else {
      const ca = await readFileContent("CA", config.ssl.caPath, "utf8");
      const cert = await readFileContent("Client cert", config.ssl.certPath, "utf8");
      const key = await readFileContent("Client key", config.ssl.keyPath, "utf8");
      if (ca) ssl.ca = ca;
      if (cert) ssl.cert = cert;
      if (key) ssl.key = key;
    }
    if (config.ssl.passphrase) ssl.passphrase = config.ssl.passphrase;
    if (Object.prototype.hasOwnProperty.call(config.ssl, "rejectUnauthorized")) {
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
    const parts = host.split(".").map((part) => Number.parseInt(part, 10));
    return { type: 0x01, buffer: Buffer.from(parts) };
  }
  if (net.isIPv6(host)) {
    const segments = host.split("::");
    const head = segments[0] ? segments[0].split(":") : [];
    const tail = segments[1] ? segments[1].split(":") : [];
    const missing = Math.max(0, 8 - (head.length + tail.length));
    const parts = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
    const buf = Buffer.alloc(16);
    parts.slice(0, 8).forEach((part, index) => {
      const value = Number.parseInt(part || "0", 16);
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
      socket.destroy(new Error("Proxy connection timeout"));
    });
  }
  socket.setNoDelay(true);
  let ready = false;
  let handshakeState = proxy.type === "http" ? "http" : "socks-method";
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
    const marker = buffer.indexOf("\r\n\r\n");
    if (marker === -1) return;
    const header = buffer.slice(0, marker).toString("utf8");
    const statusLine = header.split("\r\n")[0] || "";
    const match = statusLine.match(/HTTP\/\d+\.\d+\s+(\d+)/i);
    const status = match ? Number.parseInt(match[1], 10) : 0;
    if (status !== 200) {
      handleError(new Error(`Proxy CONNECT failed (${statusLine || "no status"})`));
      return;
    }
    buffer = buffer.slice(marker + 4);
    handshakeState = "ready";
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
      if (handshakeState === "socks-method") {
        const header = consume(2);
        if (!header) return;
        if (header[0] !== 0x05) {
          handleError(new Error("Invalid SOCKS5 response"));
          return;
        }
        if (header[1] === 0xff) {
          handleError(new Error("SOCKS5 authentication rejected"));
          return;
        }
        if (header[1] === 0x02) {
          const user = Buffer.from(proxy.username || "");
          const pass = Buffer.from(proxy.password || "");
          if (user.length > 255 || pass.length > 255) {
            handleError(new Error("SOCKS5 credentials too long"));
            return;
          }
          const authReq = Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]);
          socket.write(authReq);
          handshakeState = "socks-auth";
          continue;
        }
        handshakeState = "socks-request";
      }
      if (handshakeState === "socks-auth") {
        const authResp = consume(2);
        if (!authResp) return;
        if (authResp[1] !== 0x00) {
          handleError(new Error("SOCKS5 authentication failed"));
          return;
        }
        handshakeState = "socks-request";
      }
      if (handshakeState === "socks-request") {
        const address = toSocksAddress(target.host);
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(target.port, 0);
        const req = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, address.type]), address.buffer, portBuf]);
        socket.write(req);
        handshakeState = "socks-reply";
        continue;
      }
      if (handshakeState === "socks-reply") {
        if (buffer.length < 4) return;
        const atyp = buffer[3];
        let replyLength = 0;
        if (atyp === 0x01) replyLength = 4 + 4 + 2;
        else if (atyp === 0x04) replyLength = 4 + 16 + 2;
        else if (atyp === 0x03) {
          if (buffer.length < 5) return;
          replyLength = 4 + 1 + buffer[4] + 2;
        } else {
          handleError(new Error("SOCKS5 proxy returned unknown address type"));
          return;
        }
        const reply = consume(replyLength);
        if (!reply) return;
        if (reply[1] !== 0x00) {
          handleError(new Error(`SOCKS5 connect failed (code ${reply[1]})`));
          return;
        }
        handshakeState = "ready";
        handleReady();
        return;
      }
      return;
    }
  };

  socket.on("data", (chunk) => {
    if (ready) {
      proxyStream.push(chunk);
      return;
    }
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk);
    if (proxy.type === "http") {
      handleHttpData();
    } else {
      handleSocksData();
    }
  });
  socket.on("end", () => proxyStream.push(null));
  socket.on("close", () => proxyStream.destroy());
  socket.on("error", (err) => handleError(err));

  socket.on("connect", () => {
    const hasAuth = Boolean(proxy.username || proxy.password);
    if (proxy.type === "http") {
      const hostPort = `${target.host}:${target.port}`;
      const headers = [`CONNECT ${hostPort} HTTP/1.1`, `Host: ${hostPort}`];
      if (hasAuth) {
        const token = Buffer.from(`${proxy.username || ""}:${proxy.password || ""}`).toString("base64");
        headers.push(`Proxy-Authorization: Basic ${token}`);
      }
      headers.push("", "");
      socket.write(headers.join("\r\n"));
      return;
    }
    const methods = hasAuth ? [0x02] : [0x00];
    socket.write(Buffer.from([0x05, methods.length, ...methods]));
  });

  return proxyStream;
};

const buildPoolConfig = async (config) => {
  const options = { ...DEFAULT_POOL_OPTIONS, ...(config.options || {}) };
  const ssl = await buildSslOptions(config);
  if (ssl) options.ssl = ssl;
  const poolConfig = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || undefined,
    ...options,
  };
  const proxy = normalizeProxyInput(config.proxy);
  if (proxy.type !== "none") {
    if (!proxy.host || !Number.isInteger(proxy.port)) {
      throw new Error("proxy configuration is invalid");
    }
    poolConfig.stream = () =>
      createProxyStream({
        proxy,
        target: { host: config.host, port: config.port },
        connectTimeout: options.connectTimeout,
      });
  }
  if (!poolConfig.database) delete poolConfig.database;
  return poolConfig;
};

const hashConfig = (config) => {
  const payload = {
    type: TYPE,
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || "",
    authType: config.authType || DEFAULT_AUTH_TYPE,
    ssl: config.ssl || null,
    proxy: config.proxy || null,
    options: config.options || {},
  };
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
};

const toPublicSsl = (ssl, includeSecrets) => {
  if (!ssl) return null;
  const output = {
    mode: ssl.mode || (ssl.pfxPath ? "pfx" : "keypair"),
    caPath: ssl.caPath || "",
    certPath: ssl.certPath || "",
    keyPath: ssl.keyPath || "",
    pfxPath: ssl.pfxPath || "",
    rejectUnauthorized: ssl.rejectUnauthorized !== false,
  };
  if (includeSecrets) {
    output.passphrase = ssl.passphrase || "";
  }
  return output;
};

const toPublicProxy = (proxy, includeSecrets) => {
  const normalized = normalizeProxyInput(proxy);
  if (!normalized || normalized.type === "none") {
    return { type: "none" };
  }
  const output = {
    type: normalized.type,
    host: normalized.host,
    port: normalized.port,
    username: normalized.username,
  };
  if (includeSecrets) {
    output.password = normalized.password || "";
  }
  return output;
};

const toPublicConfig = (config, record, includePassword) => {
  const output = {
    id: record.id,
    type: TYPE,
    name: config.name,
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    authType: normalizeAuthType(config.authType),
    ssl: toPublicSsl(config.ssl, includePassword),
    proxy: toPublicProxy(config.proxy, includePassword),
    options: config.options || {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (includePassword) output.password = config.password;
  return output;
};

const createClient = async (config) => mysql.createPool(await buildPoolConfig(config));

const closeClient = async (client) => {
  if (!client) return;
  try {
    await client.end();
  } catch (_) {
    // ignore pool close errors
  }
};

const testConnection = async (client) => {
  const [rows] = await client.query("SELECT VERSION() AS version");
  return rows?.[0]?.version || null;
};

const executeQuery = async (client, sql, values) => {
  const [rows, fields] = await client.query(sql, values);
  return { rows, fields };
};

const listDatabases = async (client) => {
  const [rows] = await client.query(
    "SELECT schema_name AS name, default_character_set_name AS charset, default_collation_name AS collation FROM information_schema.schemata ORDER BY schema_name"
  );
  return { databases: rows };
};

const listTables = async (client, database) => {
  const [rows] = await client.query(
    "SELECT table_name AS name, table_type AS type, engine AS engine, table_rows AS `rows`, table_comment AS comment FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
    [database]
  );
  return { database, tables: rows };
};

const describeTable = async (client, database, table) => {
  const [rows] = await client.query(
    "SELECT column_name AS name, column_type AS type, is_nullable AS isNullable, column_default AS defaultValue, column_key AS columnKey, extra AS extra, column_comment AS comment FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
    [database, table]
  );
  return { database, table, columns: rows };
};

export const mysqlProvider = {
  type: TYPE,
  label: "MySQL",
  normalizeConfig: normalizeConfigInput,
  mergeConfig,
  validateConfig,
  toPublicConfig,
  hashConfig,
  createClient,
  closeClient,
  testConnection,
  executeQuery,
  listDatabases,
  listTables,
  describeTable,
};
