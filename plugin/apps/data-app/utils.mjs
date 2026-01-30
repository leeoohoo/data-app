export const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

export const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDuration = (ms) => {
  if (ms == null || Number.isNaN(Number(ms))) return '-';
  return `${Number(ms)} ms`;
};

export const ensureString = (value) => (value == null ? '' : String(value));

export const parseBackendResponse = (response) => {
  if (response && typeof response === 'object') {
    if (response.ok === false) {
      const details = response.error && typeof response.error === 'object' ? response.error : null;
      const fallbackMessage = ensureString(response.message) || '请求失败';
      const detailMessage =
        (details && (details.sqlMessage || details.message)) || '';
      const isGeneric =
        !fallbackMessage || fallbackMessage === 'Error' || fallbackMessage === '请求失败';
      const baseMessage = isGeneric && detailMessage ? detailMessage : fallbackMessage;
      const code = details?.code || details?.errno || details?.sqlState;
      const finalMessage =
        code && baseMessage && !baseMessage.includes(String(code))
          ? `${baseMessage} (${code})`
          : baseMessage || '请求失败';
      const err = new Error(finalMessage);
      if (details) {
        err.details = details;
        if (typeof details.stack === 'string') {
          err.stack = details.stack;
        }
      }
      console.error('[data-app] backend error', response);
      throw err;
    }
    if (response.ok === true && Object.prototype.hasOwnProperty.call(response, 'data')) {
      return response.data;
    }
  }
  return response;
};

const escapeCsv = (value) => {
  const raw = value == null ? '' : String(value);
  if (/["]|,|\n|\r/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

export const rowsToCsv = (rows, fields) => {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  let columns = [];
  if (Array.isArray(fields) && fields.length > 0) {
    columns = fields.map((field) => field.name);
  } else if (Array.isArray(rows[0])) {
    columns = rows[0].map((_, index) => `col_${index + 1}`);
  } else if (isPlainObject(rows[0])) {
    columns = Object.keys(rows[0]);
  }
  if (columns.length === 0) return '';
  const lines = [columns.map(escapeCsv).join(',')];
  for (const row of rows) {
    const values = columns.map((col, index) => {
      let value;
      if (Array.isArray(row)) {
        value = row[index];
      } else if (row && typeof row === 'object') {
        value = row[col];
      } else {
        value = row;
      }
      if (value instanceof Date) return escapeCsv(value.toISOString());
      if (typeof value === 'bigint') return escapeCsv(value.toString());
      if (typeof value === 'object' && value !== null) return escapeCsv(JSON.stringify(value));
      return escapeCsv(value);
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
};
