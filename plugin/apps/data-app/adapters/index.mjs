import { mysqlAdapter } from './mysql.mjs';
import { mongoAdapter } from './mongo.mjs';

const registry = new Map([
  ['mysql', mysqlAdapter],
  ['mariadb', mysqlAdapter],
  ['mongo', mongoAdapter],
  ['mongodb', mongoAdapter],
]);

export const getAdapter = (type = 'mysql') => {
  if (!type) return mysqlAdapter;
  const key = String(type).toLowerCase();
  return registry.get(key) || mysqlAdapter;
};

export const registerAdapter = (adapter) => {
  if (!adapter || !adapter.id) return;
  registry.set(String(adapter.id).toLowerCase(), adapter);
};

export const listAdapters = () => Array.from(registry.values());
