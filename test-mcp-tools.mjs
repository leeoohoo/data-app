import crypto from 'crypto';

const DEFAULT_PORT = 3306;

const mockData = {
  queryRows: {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Cara', email: 'cara@example.com' },
    ],
  },
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const createId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex');

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

const toolError = (message) => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const toolResponse = (payload) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
});

const buildFields = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return Object.keys(rows[0]).map((name) => ({ name }));
};

const mockQuery = async (sql) => {
  const normalized = String(sql).trim().replace(/\s+/g, ' ').toUpperCase();
  if (normalized.includes('FROM USERS')) {
    const rows = mockData.queryRows.users || [];
    return [rows, buildFields(rows)];
  }
  if (normalized.startsWith('SELECT 1')) {
    return [[{ '1': 1 }], [{ name: '1' }]];
  }
  return [[], []];
};

const fakeMysql = {
  createPool(config) {
    return {
      config,
      async query(sql) {
        return mockQuery(sql);
      },
      async end() {
        return undefined;
      },
    };
  },
};

const connections = new Map();
const pools = new Map();
let activeConnectionId = '';

const addConnection = (config) => {
  if (!isPlainObject(config)) throw new Error('config is required');
  const id = createId();
  const normalized = {
    name: config.name || '',
    host: config.host || '127.0.0.1',
    port: Number.isFinite(config.port) ? config.port : DEFAULT_PORT,
    user: config.user || 'root',
    password: config.password || '',
    database: config.database || '',
    options: isPlainObject(config.options) ? config.options : {},
  };
  connections.set(id, normalized);
  return id;
};

const getPool = (connectionId) => {
  const config = connections.get(connectionId);
  if (!config) throw new Error('connection not found');
  if (pools.has(connectionId)) return pools.get(connectionId);
  const pool = fakeMysql.createPool(config);
  pools.set(connectionId, pool);
  return pool;
};

const server = {
  tools: new Map(),
  registerTool(name, _schema, handler) {
    this.tools.set(name, handler);
  },
  async callTool(name, params = {}) {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`tool not found: ${name}`);
    return handler(params);
  },
};

server.registerTool(
  'mysql.query.execute',
  { description: 'Execute a SQL query using the active connection' },
  async ({ sql, params }) => {
    try {
      if (!activeConnectionId) throw new Error('no active connection selected in the app');
      if (!isNonEmptyString(sql)) throw new Error('sql is required');
      const config = connections.get(activeConnectionId);
      if (!config) throw new Error('connection not found');
      if (!config.database) throw new Error('database is not selected');
      const pool = getPool(activeConnectionId);
      const startedAt = Date.now();
      const [rows, fields] = await pool.query(sql, Array.isArray(params) ? params : []);
      const durationMs = Date.now() - startedAt;
      return toolResponse({
        connectionId: activeConnectionId,
        database: config.database,
        rows: sanitizeValue(rows),
        fields: sanitizeValue(fields),
        durationMs,
        rowCount: Array.isArray(rows) ? rows.length : Number(rows?.affectedRows ?? 0),
      });
    } catch (error) {
      return toolError(error?.message || 'failed to execute query');
    }
  }
);

const tests = [];
const addTest = (name, fn) => tests.push({ name, fn });

const makeAssertionError = (message, details) => {
  const error = new Error(message);
  error.details = details;
  return error;
};

const getErrorText = (result) => result?.content?.find((item) => item.type === 'text')?.text || '';

const assert = (condition, message, details) => {
  if (!condition) throw makeAssertionError(message, details);
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw makeAssertionError(message || `expected ${expected} but got ${actual}`);
  }
};

const assertOk = (result, context) => {
  if (!result || result.isError) {
    throw makeAssertionError(context || 'expected success', getErrorText(result) || 'unknown error');
  }
};

const assertError = (result, includes) => {
  assert(result && result.isError, 'expected error result', JSON.stringify(result, null, 2));
  const text = getErrorText(result);
  if (includes) {
    assert(text.includes(includes), `expected error to include "${includes}"`, text);
  }
  return text;
};

const state = {
  connectionId: '',
  noDbConnectionId: '',
};

addTest('setup connections', async () => {
  state.connectionId = addConnection({
    name: 'Local',
    host: '127.0.0.1',
    user: 'root',
    database: 'app_db',
  });
  state.noDbConnectionId = addConnection({
    name: 'NoDB',
    host: '127.0.0.1',
    user: 'root',
  });
  assert(state.connectionId, 'missing connection id');
});

addTest('mysql.query.execute missing selection', async () => {
  activeConnectionId = '';
  const result = await server.callTool('mysql.query.execute', { sql: 'SELECT 1' });
  assertError(result, 'active connection');
});

addTest('mysql.query.execute missing database', async () => {
  activeConnectionId = state.noDbConnectionId;
  const result = await server.callTool('mysql.query.execute', { sql: 'SELECT 1' });
  assertError(result, 'database');
});

addTest('mysql.query.execute success', async () => {
  activeConnectionId = state.connectionId;
  const result = await server.callTool('mysql.query.execute', { sql: 'SELECT * FROM users' });
  assertOk(result);
  assertEqual(result.structuredContent.rowCount, 3);
  assertEqual(result.structuredContent.rows[0].name, 'Alice');
  assertEqual(result.structuredContent.fields[0].name, 'id');
});

addTest('mysql.query.execute missing sql', async () => {
  activeConnectionId = state.connectionId;
  const result = await server.callTool('mysql.query.execute', { sql: '' });
  assertError(result, 'sql is required');
});

const runTests = async () => {
  console.log('MCP Tools Test Suite');
  console.log('Mocked MCP server, no real MySQL connection.');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    console.log(`\nTest: ${name}`);
    try {
      await fn();
      console.log('Status: PASS');
      passed += 1;
    } catch (error) {
      console.log('Status: FAIL');
      console.log(`Error: ${error.message}`);
      if (error.details) {
        console.log(`Details: ${error.details}`);
      }
      failed += 1;
    }
  }

  console.log('\nSummary');
  console.log(`Total: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
};

await runTests();
