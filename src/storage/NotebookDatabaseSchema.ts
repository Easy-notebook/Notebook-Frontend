import { DB_INDEXES, DB_STORES } from './schema';

interface StoreDefinition {
  name: string;
  keyPath: string;
  indexes?: Readonly<Record<string, string | readonly string[]>>;
}

/** Shared additive schema migration for every notebook database entry point. */
export class NotebookDatabaseSchema {
  private static readonly stores: StoreDefinition[] = [
    { name: DB_STORES.MIGRATION_LEDGER, keyPath: 'notebookId' },
    { name: DB_STORES.NOTEBOOKS, keyPath: 'id', indexes: DB_INDEXES.NOTEBOOKS },
    { name: DB_STORES.FILES_METADATA, keyPath: 'id', indexes: DB_INDEXES.FILES_METADATA },
    { name: DB_STORES.FILES_CONTENT, keyPath: 'fileId' },
    { name: DB_STORES.ACTIVITIES, keyPath: 'id', indexes: DB_INDEXES.ACTIVITIES },
    { name: DB_STORES.CONFIG, keyPath: 'id' },
    { name: DB_STORES.TAB_STATES, keyPath: 'notebookId', indexes: DB_INDEXES.TAB_STATES },
    { name: DB_STORES.SPLIT_FILES, keyPath: 'id', indexes: DB_INDEXES.SPLIT_FILES },
  ];

  static upgrade(db: IDBDatabase, transaction: IDBTransaction): void {
    for (const definition of this.stores) {
      const store = db.objectStoreNames.contains(definition.name)
        ? transaction.objectStore(definition.name)
        : db.createObjectStore(definition.name, { keyPath: definition.keyPath });
      for (const [alias, keyPath] of Object.entries(definition.indexes ?? {})) {
        const name = typeof keyPath === 'string' ? keyPath : alias;
        if (!store.indexNames.contains(name)) {
          store.createIndex(name, typeof keyPath === 'string' ? keyPath : [...keyPath], {
            unique: name === 'notebookPath',
          });
        }
      }
    }
  }
}
