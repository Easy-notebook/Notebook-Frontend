import { DB_STORES } from './schema';

/** Stable database identity; upgrades reconcile schema without replacing user data. */
export const DB_CONFIG = {
  NAME: 'easyremote-notebook-cache-v2',
  VERSION: 4,
  STORES: DB_STORES,
} as const;
