import fs from "fs/promises";
import crypto from "crypto";
import { isPlainObject, stableStringify } from "../lib/utils.mjs";

const TYPE = "mongo";
const ALIAS_TYPES = new Set(["mongodb"]);
const DEFAULT_SAMPLE_SIZE = 50;
const MAX_SAMPLE_SIZE = 1000;
const CUSTOM_OPTION_KEYS = new Set(["schemaSampleSize", "sampleSize", "schemaSample", "sample"]);

let mongoDriverPromise = null;

const loadMongoDriver = async () => {
  if (!mongoDriverPromise) {
    mongoDriverPromise = import("mongodb");
  }
  try {
    return await mongoDriverPromise;
  } catch (err) {
    mongoDriverPromise = null;
    const message = err?.message || String(err);
    if (err?.code === "ERR_MODULE_NOT_FOUND" || message.includes("Cannot find package 'mongodb'")) {
      throw new Error(
        "未找到 MongoDB 驱动依赖：请在打包时将 mongodb bundle 进插件，或在 ChatOS 运行环境安装 mongodb。"
      );
    }
    throw err;
  }
};

const normalizeProviderType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "mongodb" ? TYPE : normalized;
};

const splitHosts = (value) =>
  String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeHostsInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^mongodb(\+srv)?:\/\//i.test(raw)) return raw;
  return splitHosts(raw).join(",");
};

const normalizeTlsInput = (input) => {
  if (input == null) {
    return { enabled: false };
  }
  if (!isPlainObject(input)) {
    return { enabled: Boolean(input) };
  }
  const enabled = Boolean(input.enabled || input.caPath || input.certPath || input.keyPath);
  const caPath = String(input.caPath || input.ca || "").trim();
  const certPath = String(input.certPath || input.cert || "").trim();
  const keyPath = String(input.keyPath || input.key || "").trim();
  const passphrase = input.passphrase == null ? "" : String(input.passphrase);
  const rejectUnauthorized = Object.prototype.hasOwnProperty.call(input, "rejectUnauthorized")
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

const normalizeOptions = (options) => {
  if (!isPlainObject(options)) return {};
  const output = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  return output;
};

const normalizeConfigInput = (input) => {
  if (!isPlainObject(input)) throw new Error("config is required");
  const rawType = normalizeProviderType(input.type);
  if (rawType && rawType !== TYPE) {
    throw new Error(`unsupported database type: ${input.type}`);
  }
  const name = String(input.name || "").trim();
  const hosts = normalizeHostsInput(input.hosts ?? input.host ?? input.uri ?? "");
  const user = String(input.user || input.username || "").trim();
  const password = input.password == null ? "" : String(input.password);
  const database = input.database == null ? "" : String(input.database).trim();
  const authSource = String(input.authSource || "").trim();
  const authMechanism = String(input.authMechanism || "").trim();
  const replicaSet = String(input.replicaSet || "").trim();
  const tls = normalizeTlsInput(input.tls ?? input.ssl);
  const options = normalizeOptions(input.options ?? input.clientOptions ?? {});
  return {
    type: TYPE,
    name,
    hosts,
    user,
    password,
    database,
    authSource,
    authMechanism,
    replicaSet,
    tls,
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
    const rawType = normalizeProviderType(patch.type);
    if (rawType && rawType !== TYPE) {
      throw new Error("changing database type is not supported");
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    next.name = String(patch.name || "").trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "hosts") ||
    Object.prototype.hasOwnProperty.call(patch, "host") ||
    Object.prototype.hasOwnProperty.call(patch, "uri")
  ) {
    next.hosts = normalizeHostsInput(patch.hosts ?? patch.host ?? patch.uri ?? "");
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
  if (Object.prototype.hasOwnProperty.call(patch, "authSource")) {
    next.authSource = String(patch.authSource || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "authMechanism")) {
    next.authMechanism = String(patch.authMechanism || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "replicaSet")) {
    next.replicaSet = String(patch.replicaSet || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "tls") || Object.prototype.hasOwnProperty.call(patch, "ssl")) {
    const rawTls = patch.tls ?? patch.ssl;
    const hasPassphrase = isPlainObject(rawTls) && Object.prototype.hasOwnProperty.call(rawTls, "passphrase");
    const normalized = normalizeTlsInput(rawTls);
    const baseTls = isPlainObject(next.tls) ? next.tls : { enabled: false };
    next.tls = { ...baseTls, ...normalized };
    if (!hasPassphrase && baseTls.passphrase) {
      next.tls.passphrase = baseTls.passphrase;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "options") || Object.prototype.hasOwnProperty.call(patch, "clientOptions")) {
    next.options = mergeOptions(next.options, patch.options ?? patch.clientOptions ?? {});
  }
  return next;
};

const validateConfig = (config) => {
  if (!config.name) throw new Error("name is required");
  if (!config.hosts) throw new Error("hosts is required");
  const hosts = splitHosts(config.hosts);
  if (hosts.length === 0) throw new Error("hosts is required");
  const tls = normalizeTlsInput(config.tls);
  if (tls.enabled) {
    const hasCert = Boolean(tls.certPath);
    const hasKey = Boolean(tls.keyPath);
    if (hasCert !== hasKey) {
      throw new Error("tls certPath and keyPath must be provided together");
    }
  }
};

const hashConfig = (config) => {
  const payload = {
    type: TYPE,
    hosts: config.hosts,
    user: config.user,
    password: config.password,
    database: config.database || "",
    authSource: config.authSource || "",
    authMechanism: config.authMechanism || "",
    replicaSet: config.replicaSet || "",
    tls: config.tls || null,
    options: config.options || {},
  };
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
};

const toPublicTls = (tls, includeSecrets) => {
  const normalized = normalizeTlsInput(tls);
  const output = {
    enabled: Boolean(normalized.enabled),
    caPath: normalized.caPath || "",
    certPath: normalized.certPath || "",
    keyPath: normalized.keyPath || "",
    rejectUnauthorized: normalized.rejectUnauthorized !== false,
  };
  if (includeSecrets) {
    output.passphrase = normalized.passphrase || "";
  }
  return output;
};

const toPublicConfig = (config, record, includePassword) => {
  const output = {
    id: record.id,
    type: TYPE,
    name: config.name,
    hosts: config.hosts,
    user: config.user,
    database: config.database,
    authSource: config.authSource,
    authMechanism: config.authMechanism,
    replicaSet: config.replicaSet,
    tls: toPublicTls(config.tls, includePassword),
    options: config.options || {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (includePassword) output.password = config.password;
  return output;
};

const readFileContent = async (label, filePath) => {
  if (!filePath) return null;
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    throw new Error(`${label} file read failed (${filePath}): ${err?.message || String(err)}`);
  }
};

const buildTlsOptions = async (config) => {
  const tls = normalizeTlsInput(config.tls);
  if (!tls.enabled) return {};
  const options = { tls: true };
  if (tls.caPath) options.ca = await readFileContent("CA", tls.caPath);
  if (tls.certPath) options.cert = await readFileContent("Client cert", tls.certPath);
  if (tls.keyPath) options.key = await readFileContent("Client key", tls.keyPath);
  if (tls.passphrase) options.passphrase = tls.passphrase;
  if (Object.prototype.hasOwnProperty.call(tls, "rejectUnauthorized")) {
    options.rejectUnauthorized = tls.rejectUnauthorized !== false;
    if (tls.rejectUnauthorized === false) {
      options.tlsAllowInvalidCertificates = true;
    }
  }
  return options;
};

const filterClientOptions = (options) => {
  const normalized = normalizeOptions(options);
  const output = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (CUSTOM_OPTION_KEYS.has(key)) continue;
    output[key] = value;
  }
  return output;
};

const resolveMongoUri = (config) => {
  const raw = String(config.hosts || "").trim();
  if (!raw) throw new Error("hosts is required");
  if (/^mongodb(\+srv)?:\/\//i.test(raw)) {
    return { uri: raw, usesRawUri: true };
  }
  const hosts = splitHosts(raw);
  if (hosts.length === 0) throw new Error("hosts is required");
  let auth = "";
  if (config.user) {
    auth = encodeURIComponent(config.user);
    if (config.password != null) {
      auth += `:${encodeURIComponent(config.password)}`;
    }
    auth += "@";
  }
  const database = config.database ? `/${encodeURIComponent(config.database)}` : "";
  const params = new URLSearchParams();
  if (config.authSource) params.set("authSource", config.authSource);
  if (config.authMechanism) params.set("authMechanism", config.authMechanism);
  if (config.replicaSet) params.set("replicaSet", config.replicaSet);
  if (config.tls?.enabled) params.set("tls", "true");
  const query = params.toString();
  const path = database || (query ? "/" : "");
  const suffix = query ? `?${query}` : "";
  return { uri: `mongodb://${auth}${hosts.join(",")}${path}${suffix}`, usesRawUri: false };
};

const buildClientOptions = async (config, usesRawUri) => {
  const options = filterClientOptions(config.options);
  const tlsOptions = await buildTlsOptions(config);
  Object.assign(options, tlsOptions);
  if (config.authSource) options.authSource = config.authSource;
  if (config.authMechanism) options.authMechanism = config.authMechanism;
  if (config.replicaSet) options.replicaSet = config.replicaSet;
  if (usesRawUri && config.user) {
    options.auth = { username: config.user, password: config.password };
  }
  return options;
};

const createClient = async (config) => {
  const { MongoClient } = await loadMongoDriver();
  const { uri, usesRawUri } = resolveMongoUri(config);
  const options = await buildClientOptions(config, usesRawUri);
  const client = new MongoClient(uri, options);
  client.__dataAppDefaultDb = config.database || "";
  await client.connect();
  return client;
};

const closeClient = async (client) => {
  if (!client) return;
  try {
    await client.close();
  } catch (_) {
    // ignore close errors
  }
};

const testConnection = async (client) => {
  await client.db("admin").command({ ping: 1 });
  try {
    const buildInfo = await client.db("admin").command({ buildInfo: 1 });
    return buildInfo?.version || null;
  } catch (_) {
    return null;
  }
};

const isBsonValue = (value) => Boolean(value) && typeof value === "object" && typeof value._bsontype === "string";

const formatBsonValue = (value) => {
  const type = value?._bsontype;
  if (!type) return String(value);
  if (type === "ObjectId" && typeof value.toHexString === "function") return value.toHexString();
  if (type === "Binary") {
    if (value.buffer) return Buffer.from(value.buffer).toString("base64");
    if (typeof value.value === "function") {
      const buf = value.value(true);
      return Buffer.from(buf).toString("base64");
    }
  }
  if (typeof value.toString === "function") return value.toString();
  return String(value);
};

const sanitizeMongoValue = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (isBsonValue(value)) return formatBsonValue(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") return value;
  if (valueType === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitizeMongoValue(item, seen));
  if (valueType === "object") {
    if (seen.has(value)) return "[Circular]";
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

const formatSample = (value) => {
  if (value === undefined) return "";
  const sanitized = sanitizeMongoValue(value);
  if (sanitized === null) return "null";
  if (typeof sanitized === "string" || typeof sanitized === "number" || typeof sanitized === "boolean") {
    return String(sanitized);
  }
  try {
    const text = JSON.stringify(sanitized);
    if (!text) return "";
    return text.length > 200 ? `${text.slice(0, 197)}...` : text;
  } catch (_) {
    return String(sanitized);
  }
};

const getValueType = (value) => {
  if (value === null) return "null";
  if (isBsonValue(value)) return value._bsontype || "bson";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array";
    const types = new Set();
    value.slice(0, 6).forEach((item) => types.add(getValueType(item)));
    const inner = Array.from(types).join("|");
    return inner ? `array<${inner}>` : "array";
  }
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regex";
  if (Buffer.isBuffer(value)) return "binary";
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean" || valueType === "bigint") {
    return valueType;
  }
  if (valueType === "object") return "object";
  return valueType;
};

const parseMongoQuery = (sql) => {
  const trimmed = String(sql || "").trim();
  if (!trimmed) throw new Error("查询内容为空");
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error("Mongo 查询目前仅支持 JSON 格式，例如: { \"collection\": \"users\", \"action\": \"find\", \"filter\": {} }");
  }
};

const resolveDatabase = (client, payload) => {
  const name = String(payload?.database || payload?.db || "").trim();
  if (name) return client.db(name);
  const fallback = String(client?.__dataAppDefaultDb || "").trim();
  if (fallback) return client.db(fallback);
  return client.db();
};

const executeQuery = async (client, sql) => {
  const payload = parseMongoQuery(sql);
  if (!isPlainObject(payload)) throw new Error("Mongo 查询必须是 JSON 对象");
  const db = resolveDatabase(client, payload);

  if (payload.command) {
    const command = payload.command;
    let commandDoc;
    if (typeof command === "string") {
      const extra = isPlainObject(payload.commandOptions) ? payload.commandOptions : {};
      commandDoc = { [command]: 1, ...extra };
    } else if (isPlainObject(command)) {
      commandDoc = command;
    } else {
      throw new Error("command 必须是字符串或对象");
    }
    const result = await db.command(commandDoc);
    return { rows: [sanitizeMongoValue(result)] };
  }

  const collectionName = String(payload.collection || payload.table || payload.name || "").trim();
  if (!collectionName) throw new Error("collection is required");
  const collection = db.collection(collectionName);
  const options = isPlainObject(payload.options) ? payload.options : {};
  let action = String(payload.action || payload.op || payload.method || "").trim().toLowerCase();
  if (!action) action = Array.isArray(payload.pipeline) ? "aggregate" : "find";

  if (action === "find") {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const projection = isPlainObject(payload.projection) ? payload.projection : undefined;
    let cursor = collection.find(filter, { ...options, projection });
    if (isPlainObject(payload.sort)) cursor = cursor.sort(payload.sort);
    if (Number.isFinite(Number(payload.skip))) cursor = cursor.skip(Number(payload.skip));
    if (Number.isFinite(Number(payload.limit))) cursor = cursor.limit(Number(payload.limit));
    const docs = await cursor.toArray();
    return { rows: sanitizeMongoValue(docs) };
  }

  if (action === "findone") {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const projection = isPlainObject(payload.projection) ? payload.projection : undefined;
    const sort = isPlainObject(payload.sort) ? payload.sort : undefined;
    const doc = await collection.findOne(filter, { ...options, projection, sort });
    return { rows: doc ? [sanitizeMongoValue(doc)] : [] };
  }

  if (action === "aggregate") {
    if (!Array.isArray(payload.pipeline)) throw new Error("pipeline must be an array");
    const docs = await collection.aggregate(payload.pipeline, options).toArray();
    return { rows: sanitizeMongoValue(docs) };
  }

  if (action === "insertone") {
    if (!isPlainObject(payload.document)) throw new Error("document is required");
    const result = await collection.insertOne(payload.document, options);
    const summary = { ...sanitizeMongoValue(result), affectedRows: result?.acknowledged ? 1 : 0 };
    return { rows: summary };
  }

  if (action === "insertmany") {
    if (!Array.isArray(payload.documents)) throw new Error("documents must be an array");
    const result = await collection.insertMany(payload.documents, options);
    const summary = { ...sanitizeMongoValue(result), affectedRows: result?.insertedCount ?? 0 };
    return { rows: summary };
  }

  if (action === "updateone" || action === "updatemany") {
    if (!isPlainObject(payload.update) && !Array.isArray(payload.update)) {
      throw new Error("update is required");
    }
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const method = action === "updateone" ? "updateOne" : "updateMany";
    const result = await collection[method](filter, payload.update, options);
    const modified = Number(result?.modifiedCount ?? 0);
    const upserted = Number(result?.upsertedCount ?? 0);
    const summary = { ...sanitizeMongoValue(result), affectedRows: modified + upserted };
    return { rows: summary };
  }

  if (action === "deleteone" || action === "deletemany") {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const method = action === "deleteone" ? "deleteOne" : "deleteMany";
    const result = await collection[method](filter, options);
    const summary = { ...sanitizeMongoValue(result), affectedRows: result?.deletedCount ?? 0 };
    return { rows: summary };
  }

  if (action === "count") {
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const count = await collection.countDocuments(filter, options);
    return { rows: [{ count }] };
  }

  if (action === "distinct") {
    const field = String(payload.field || "").trim();
    if (!field) throw new Error("field is required");
    const filter = isPlainObject(payload.filter) ? payload.filter : {};
    const values = await collection.distinct(field, filter, options);
    return { rows: values.map((value) => ({ value: sanitizeMongoValue(value) })) };
  }

  throw new Error(`unsupported action: ${action}`);
};

const listDatabases = async (client) => {
  const admin = client.db("admin").admin();
  const result = await admin.listDatabases();
  const databases = Array.isArray(result?.databases)
    ? result.databases.map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty,
      }))
    : [];
  return { databases };
};

const listTables = async (client, database) => {
  const db = client.db(database);
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const tables = collections.map((item) => ({
    name: item.name,
    type: item.type || "collection",
    options: item.options,
    info: item.info,
  }));
  return { database, tables };
};

const getSampleSize = (options) => {
  const raw = options?.schemaSampleSize ?? options?.sampleSize ?? options?.schemaSample ?? options?.sample;
  const parsed = raw == null || raw === "" ? DEFAULT_SAMPLE_SIZE : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SAMPLE_SIZE;
  return Math.min(parsed, MAX_SAMPLE_SIZE);
};

const sampleDocuments = async (collection, size) => {
  if (!Number.isFinite(size) || size <= 0) return [];
  try {
    return await collection.aggregate([{ $sample: { size } }]).toArray();
  } catch (_) {
    return await collection.find({}).limit(size).toArray();
  }
};

const describeTable = async (client, database, table, config) => {
  const db = client.db(database);
  const collection = db.collection(table);
  const sampleSize = getSampleSize(config?.options);
  const docs = await sampleDocuments(collection, sampleSize);
  const total = docs.length;
  const fields = new Map();

  docs.forEach((doc) => {
    if (!doc || typeof doc !== "object") return;
    Object.entries(doc).forEach(([key, value]) => {
      const entry = fields.get(key) || { name: key, types: new Set(), count: 0, sample: undefined };
      entry.count += 1;
      entry.types.add(getValueType(value));
      if (entry.sample === undefined) entry.sample = value;
      fields.set(key, entry);
    });
  });

  const columns = Array.from(fields.values())
    .map((entry) => ({
      name: entry.name,
      types: Array.from(entry.types).sort(),
      sample: formatSample(entry.sample),
      count: entry.count,
      total,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { database, table, columns };
};

export const mongoProvider = {
  type: TYPE,
  label: "MongoDB",
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

export const mongoAliases = ALIAS_TYPES;
