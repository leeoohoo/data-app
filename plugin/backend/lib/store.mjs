import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { cloneJson } from "./utils.mjs";
import { DATA_VERSION, ENCRYPTION, FILENAMES, SECRET_VERSION } from "./constants.mjs";

const encryptJson = (key, payload) => {
  const iv = crypto.randomBytes(ENCRYPTION.ivBytes);
  const cipher = crypto.createCipheriv(ENCRYPTION.algorithm, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decryptJson = (key, payload) => {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, ENCRYPTION.ivBytes);
  const tag = buffer.subarray(ENCRYPTION.ivBytes, ENCRYPTION.ivBytes + ENCRYPTION.tagBytes);
  const encrypted = buffer.subarray(ENCRYPTION.ivBytes + ENCRYPTION.tagBytes);
  const decipher = crypto.createDecipheriv(ENCRYPTION.algorithm, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
};

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return cloneJson(fallback);
    throw err;
  }
};

const writeJson = async (filePath, payload) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2));
  await fs.rename(tmpPath, filePath);
};

export const createDataStore = async ({ dataDir } = {}) => {
  const rootDir = dataDir ? String(dataDir) : path.join(process.cwd(), ".data");
  await fs.mkdir(rootDir, { recursive: true });

  const paths = {
    connections: path.join(rootDir, FILENAMES.connections),
    history: path.join(rootDir, FILENAMES.history),
    secret: path.join(rootDir, FILENAMES.secret),
    mcpSelection: path.join(rootDir, FILENAMES.mcpSelection),
    mcpEvent: path.join(rootDir, FILENAMES.mcpEvent),
  };

  let secretKey = null;
  let connectionsCache = null;
  let historyCache = null;
  let mcpSelectionCache = null;
  let writeQueue = Promise.resolve();

  const withWriteLock = (fn) => {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.catch(() => undefined);
    return next;
  };

  const loadSecretKey = async () => {
    if (secretKey) return secretKey;
    const existing = await readJson(paths.secret, null);
    if (existing?.key) {
      const decoded = Buffer.from(existing.key, "base64");
      if (decoded.length !== ENCRYPTION.keyBytes) {
        throw new Error("invalid encryption key length");
      }
      secretKey = decoded;
      return secretKey;
    }
    const created = {
      version: SECRET_VERSION,
      createdAt: new Date().toISOString(),
      key: crypto.randomBytes(ENCRYPTION.keyBytes).toString("base64"),
    };
    await writeJson(paths.secret, created);
    secretKey = Buffer.from(created.key, "base64");
    return secretKey;
  };

  const loadConnections = async () => {
    if (connectionsCache) return connectionsCache;
    const data = await readJson(paths.connections, { version: DATA_VERSION, items: [] });
    if (!data || !Array.isArray(data.items)) {
      throw new Error("connections store is corrupted");
    }
    connectionsCache = data;
    return data;
  };

  const saveConnections = async (data) => {
    connectionsCache = data;
    await writeJson(paths.connections, data);
  };

  const loadHistory = async () => {
    if (historyCache) return historyCache;
    const data = await readJson(paths.history, { version: DATA_VERSION, items: [] });
    if (!data || !Array.isArray(data.items)) {
      throw new Error("history store is corrupted");
    }
    historyCache = data;
    return data;
  };

  const saveHistory = async (data) => {
    historyCache = data;
    await writeJson(paths.history, data);
  };

  const saveMcpSelection = async (data) => {
    mcpSelectionCache = data;
    await writeJson(paths.mcpSelection, data);
  };

  const encryptConfig = async (payload) => {
    const key = await loadSecretKey();
    return encryptJson(key, payload);
  };

  const decryptConfig = async (payload) => {
    const key = await loadSecretKey();
    return decryptJson(key, payload);
  };

  return {
    dataDir: rootDir,
    paths,
    readJson,
    writeJson,
    withWriteLock,
    loadSecretKey,
    loadConnections,
    saveConnections,
    loadHistory,
    saveHistory,
    saveMcpSelection,
    encryptConfig,
    decryptConfig,
  };
};
