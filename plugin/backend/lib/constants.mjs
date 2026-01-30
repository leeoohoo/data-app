export const FILENAMES = {
  connections: 'connections.json',
  history: 'history.json',
  secret: 'secret.json',
  mcpSelection: 'mcp-selection.json',
  mcpEvent: 'mcp-last-event.json',
};

export const HISTORY_LIMIT = 200;
export const SECRET_VERSION = 1;
export const DATA_VERSION = 1;

export const ENCRYPTION = {
  algorithm: 'aes-256-gcm',
  keyBytes: 32,
  ivBytes: 12,
  tagBytes: 16,
};
