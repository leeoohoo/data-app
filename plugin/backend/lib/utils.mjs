import crypto from 'crypto';

export const createId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

export const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const cloneJson = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

export const serializeError = (err) => {
  if (!err) return null;
  return {
    message: err.message || String(err),
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
    stack: typeof err.stack === 'string' ? err.stack : undefined,
  };
};

export const ok = (data, extra) => ({ ok: true, data, ...(extra || {}) });
export const fail = (err, extra) => ({
  ok: false,
  message: err?.message || String(err),
  error: serializeError(err),
  ...(extra || {}),
});

export const sanitizeForJson = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map((item) => sanitizeForJson(item, seen));
  if (valueType === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeForJson(item, seen);
    }
    seen.delete(value);
    return output;
  }
  return String(value);
};

export const stableSort = (value) => {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }
  if (isPlainObject(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = stableSort(value[key]);
    }
    return output;
  }
  return value;
};

export const stableStringify = (value) => JSON.stringify(stableSort(value));
