import { mongoAliases, mongoProvider } from "./mongo.mjs";
import { mysqlProvider } from "./mysql.mjs";

const PROVIDERS = new Map([
  [mysqlProvider.type, mysqlProvider],
  [mongoProvider.type, mongoProvider],
  ...Array.from(mongoAliases, (alias) => [alias, mongoProvider]),
]);

export const DEFAULT_PROVIDER_TYPE = mysqlProvider.type;

export const normalizeProviderType = (value) => String(value || "").trim().toLowerCase();

export const ensureProviderType = (value) => {
  const normalized = normalizeProviderType(value);
  if (!normalized) return DEFAULT_PROVIDER_TYPE;
  if (!PROVIDERS.has(normalized)) {
    throw new Error(`unsupported database type: ${value}`);
  }
  return normalized;
};

export const getProvider = (value) => {
  const normalized = normalizeProviderType(value);
  if (!normalized) return PROVIDERS.get(DEFAULT_PROVIDER_TYPE);
  const provider = PROVIDERS.get(normalized);
  if (!provider) {
    throw new Error(`unsupported database type: ${value}`);
  }
  return provider;
};

export const listProviders = () =>
  Array.from(PROVIDERS.values()).map((provider) => ({
    type: provider.type,
    label: provider.label || provider.type,
  }));
