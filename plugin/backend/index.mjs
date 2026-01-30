import { createDataStore } from "./lib/store.mjs";
import { DATA_VERSION, HISTORY_LIMIT } from "./lib/constants.mjs";
import { createId, sanitizeForJson, serializeError, ok, fail } from "./lib/utils.mjs";
import { ensureProviderType, getProvider } from "./providers/index.mjs";

export async function createUiAppsBackend(ctx) {
  const store = await createDataStore({ dataDir: ctx?.dataDir });
  const {
    paths,
    readJson,
    withWriteLock,
    loadConnections,
    saveConnections,
    loadHistory,
    saveHistory,
    saveMcpSelection,
    encryptConfig,
    decryptConfig,
  } = store;

  const clients = new Map();

  const normalizeStoredConfig = (config) => {
    if (!config || typeof config !== "object") {
      throw new Error("connection config is corrupted");
    }
    const provider = getProvider(config.type);
    if (!config.type) {
      return { provider, config: { ...config, type: provider.type } };
    }
    return { provider, config };
  };

  const getConnectionRecord = async (id) => {
    const data = await loadConnections();
    const record = data.items.find((item) => item.id === id);
    if (!record) throw new Error("connection not found");
    let config;
    try {
      config = await decryptConfig(record.encrypted);
    } catch (err) {
      throw new Error(`failed to decrypt connection config: ${err?.message || String(err)}`);
    }
    const normalized = normalizeStoredConfig(config);
    return { record, ...normalized };
  };

  const listConnections = async () => {
    const data = await loadConnections();
    if (data.items.length === 0) return [];
    return Promise.all(
      data.items.map(async (record) => {
        const config = await decryptConfig(record.encrypted);
        const normalized = normalizeStoredConfig(config);
        return normalized.provider.toPublicConfig(normalized.config, record, false);
      })
    );
  };

  const recordHistory = async (entry) => {
    await withWriteLock(async () => {
      const data = await loadHistory();
      data.items.unshift(entry);
      if (data.items.length > HISTORY_LIMIT) {
        data.items.length = HISTORY_LIMIT;
      }
      await saveHistory(data);
    });
  };

  const recordHistorySafe = async (entry) => {
    try {
      await recordHistory(entry);
      return null;
    } catch (err) {
      return serializeError(err);
    }
  };

  const setMcpSelection = async (connectionId, database) => {
    const id = String(connectionId || "").trim();
    const db = database == null ? "" : String(database).trim();
    const now = new Date().toISOString();
    const selection = {
      version: DATA_VERSION,
      connectionId: "",
      database: "",
      updatedAt: now,
    };
    if (!id) {
      await withWriteLock(async () => {
        await saveMcpSelection(selection);
      });
      return selection;
    }
    await getConnectionRecord(id);
    selection.connectionId = id;
    selection.database = db;
    await withWriteLock(async () => {
      await saveMcpSelection(selection);
    });
    return selection;
  };

  const closeClient = async (id) => {
    const cached = clients.get(id);
    if (!cached) return;
    clients.delete(id);
    try {
      const provider = getProvider(cached.providerType);
      await provider.closeClient(cached.client);
    } catch (err) {
      try {
        if (typeof cached.client?.end === "function") {
          await cached.client.end();
        }
      } catch (_) {
        // ignore close errors
      }
    }
  };

  const getClientForConfig = async (id, config, provider) => {
    const fingerprint = provider.hashConfig(config);
    const cached = clients.get(id);
    if (cached && cached.hash === fingerprint && cached.providerType === provider.type) return cached.client;
    if (cached) {
      await closeClient(id);
    }
    const client = await provider.createClient(config);
    clients.set(id, { client, hash: fingerprint, providerType: provider.type });
    return client;
  };

  const getClientById = async (id) => {
    const { record, config, provider } = await getConnectionRecord(id);
    const client = await getClientForConfig(record.id, config, provider);
    return { client, record, config, provider };
  };

  const llmComplete = async (params, runtimeCtx) => {
    const api = runtimeCtx?.llm || ctx?.llm || null;
    if (!api || typeof api.complete !== "function") {
      throw new Error("Host LLM bridge is not available (ctx.llm.complete)");
    }
    const input = typeof params?.input === "string" ? params.input : typeof params?.prompt === "string" ? params.prompt : "";
    const normalized = String(input || "").trim();
    if (!normalized) {
      throw new Error("input is required");
    }
    return await api.complete({
      input: normalized,
      modelId: typeof params?.modelId === "string" ? params.modelId : undefined,
      modelName: typeof params?.modelName === "string" ? params.modelName : undefined,
      systemPrompt: typeof params?.systemPrompt === "string" ? params.systemPrompt : undefined,
      disableTools: params?.disableTools,
    });
  };

  const wrap = (fn) => async (params, runtimeCtx) => {
    try {
      const data = await fn(params ?? {}, runtimeCtx);
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  };

  return {
    methods: {
      ping: wrap(async (params, runtimeCtx) => ({
        now: new Date().toISOString(),
        pluginId: runtimeCtx?.pluginId || ctx?.pluginId || "",
        params: params ?? null,
      })),

      llmComplete,

      "mcp.selection.set": wrap(async (params) => {
        const id = String(params?.connectionId || params?.id || "").trim();
        const database = params?.database;
        return await setMcpSelection(id, database);
      }),

      "mcp.event.latest": wrap(async (params) => {
        const after = typeof params?.after === "string" ? params.after.trim() : "";
        const event = await readJson(paths.mcpEvent, null);
        if (!event || typeof event !== "object") return { event: null };
        if (after && (event.id === after || event.at === after)) return { event: null };
        return { event };
      }),

      "connections.list": wrap(async () => ({
        items: await listConnections(),
      })),

      "connections.get": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        if (!id) throw new Error("connectionId is required");
        const { record, config, provider } = await getConnectionRecord(id);
        const includePassword = Boolean(params?.includePassword);
        return { connection: provider.toPublicConfig(config, record, includePassword) };
      }),

      "connections.create": wrap(async (params) => {
        const input = params?.config ?? params;
        const providerType = ensureProviderType(input?.type);
        const provider = getProvider(providerType);
        const config = provider.normalizeConfig(input);
        provider.validateConfig(config);
        const now = new Date().toISOString();
        const id = createId();
        const record = {
          id,
          createdAt: now,
          updatedAt: now,
          encrypted: await encryptConfig(config),
        };
        await withWriteLock(async () => {
          const data = await loadConnections();
          data.items.push(record);
          await saveConnections(data);
        });
        return { connection: provider.toPublicConfig(config, record, false) };
      }),

      "connections.update": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        if (!id) throw new Error("connectionId is required");
        const patch = params?.config ?? params?.patch ?? {};
        let updatedRecord = null;
        let updatedConfig = null;
        let provider = null;
        await withWriteLock(async () => {
          const data = await loadConnections();
          const index = data.items.findIndex((item) => item.id === id);
          if (index < 0) throw new Error("connection not found");
          const record = data.items[index];
          const existingConfig = await decryptConfig(record.encrypted);
          const normalized = normalizeStoredConfig(existingConfig);
          provider = normalized.provider;
          const merged = provider.mergeConfig(normalized.config, patch);
          provider.validateConfig(merged);
          const updated = {
            ...record,
            updatedAt: new Date().toISOString(),
            encrypted: await encryptConfig(merged),
          };
          data.items[index] = updated;
          await saveConnections(data);
          updatedRecord = updated;
          updatedConfig = merged;
        });
        if (!updatedRecord || !provider) throw new Error("failed to update connection");
        await closeClient(id);
        return { connection: provider.toPublicConfig(updatedConfig, updatedRecord, false) };
      }),

      "connections.delete": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        if (!id) throw new Error("connectionId is required");
        let removed = null;
        await withWriteLock(async () => {
          const data = await loadConnections();
          const index = data.items.findIndex((item) => item.id === id);
          if (index < 0) throw new Error("connection not found");
          removed = data.items.splice(index, 1)[0];
          await saveConnections(data);
        });
        await closeClient(id);
        return { deleted: Boolean(removed), id };
      }),

      "connections.test": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        const rawConfig = params?.config;
        const start = Date.now();
        let client;
        let config;
        let provider;
        if (id) {
          ({ client, config, provider } = await getClientById(id));
        } else if (rawConfig) {
          const providerType = ensureProviderType(rawConfig?.type);
          provider = getProvider(providerType);
          config = provider.normalizeConfig(rawConfig);
          provider.validateConfig(config);
          client = await provider.createClient(config);
        } else {
          throw new Error("connectionId or config is required");
        }
        try {
          const serverVersion = await provider.testConnection(client, config);
          const durationMs = Date.now() - start;
          return {
            connectionId: id || null,
            serverVersion,
            durationMs,
          };
        } finally {
          if (!id && client) {
            await provider.closeClient(client);
          }
        }
      }),

      "query.execute": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        if (!id) throw new Error("connectionId is required");
        const sql = String(params?.sql || "").trim();
        if (!sql) throw new Error("sql is required");
        const values = params?.params ?? params?.values ?? [];
        const { client, provider } = await getClientById(id);
        const startedAt = Date.now();
        try {
          const { rows, fields } = await provider.executeQuery(client, sql, values);
          const durationMs = Date.now() - startedAt;
          const rowCount = Array.isArray(rows) ? rows.length : Number(rows?.affectedRows ?? 0);
          const historyError = await recordHistorySafe({
            id: createId(),
            connectionId: id,
            sql,
            params: sanitizeForJson(values),
            durationMs,
            rowCount,
            status: "success",
            createdAt: new Date().toISOString(),
          });
          return {
            rows,
            fields,
            durationMs,
            rowCount,
            warnings: historyError ? { history: historyError } : undefined,
          };
        } catch (err) {
          const durationMs = Date.now() - startedAt;
          await recordHistorySafe({
            id: createId(),
            connectionId: id,
            sql,
            params: sanitizeForJson(values),
            durationMs,
            rowCount: 0,
            status: "error",
            error: serializeError(err),
            createdAt: new Date().toISOString(),
          });
          throw err;
        }
      }),

      "schema.listDatabases": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        const rawConfig = params?.config;
        let client;
        let config;
        let provider;
        if (id) {
          ({ client, config, provider } = await getClientById(id));
        } else if (rawConfig) {
          const providerType = ensureProviderType(rawConfig?.type);
          provider = getProvider(providerType);
          config = provider.normalizeConfig(rawConfig);
          provider.validateConfig(config);
          client = await provider.createClient(config);
        } else {
          throw new Error("connectionId or config is required");
        }
        try {
          return await provider.listDatabases(client, config);
        } finally {
          if (!id && client) {
            await provider.closeClient(client);
          }
        }
      }),

      "schema.listTables": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        if (!id) throw new Error("connectionId is required");
        const { client, config, provider } = await getClientById(id);
        const database = String(params?.database || config.database || "").trim();
        if (!database) throw new Error("database is required");
        return await provider.listTables(client, database, config);
      }),

      "schema.describeTable": wrap(async (params) => {
        const id = String(params?.id || params?.connectionId || "").trim();
        if (!id) throw new Error("connectionId is required");
        const { client, config, provider } = await getClientById(id);
        const database = String(params?.database || config.database || "").trim();
        const table = String(params?.table || params?.tableName || "").trim();
        if (!database) throw new Error("database is required");
        if (!table) throw new Error("table is required");
        return await provider.describeTable(client, database, table, config);
      }),

      "history.list": wrap(async (params) => {
        const limit = Math.max(1, Math.min(Number.parseInt(params?.limit ?? 50, 10) || 50, HISTORY_LIMIT));
        const offset = Math.max(0, Number.parseInt(params?.offset ?? 0, 10) || 0);
        const connectionId = String(params?.connectionId || params?.id || "").trim();
        const data = await loadHistory();
        const filtered = connectionId
          ? data.items.filter((item) => item.connectionId === connectionId)
          : data.items;
        const items = filtered.slice(offset, offset + limit);
        return {
          items,
          total: filtered.length,
          limit,
          offset,
        };
      }),

      "history.clear": wrap(async (params) => {
        const connectionId = String(params?.connectionId || params?.id || "").trim();
        let cleared = 0;
        await withWriteLock(async () => {
          const data = await loadHistory();
          if (!connectionId) {
            cleared = data.items.length;
            data.items = [];
          } else {
            const next = data.items.filter((item) => item.connectionId !== connectionId);
            cleared = data.items.length - next.length;
            data.items = next;
          }
          await saveHistory(data);
        });
        return { cleared, connectionId: connectionId || null };
      }),
    },

    async dispose() {
      const closing = Array.from(clients.values()).map(async (entry) => {
        try {
          const provider = getProvider(entry.providerType);
          await provider.closeClient(entry.client);
        } catch (err) {
          try {
            if (typeof entry.client?.end === "function") {
              await entry.client.end();
            }
          } catch (_) {
            // ignore close errors
          }
        }
      });
      clients.clear();
      await Promise.allSettled(closing);
    },
  };
}
