import type { IStorageProvider } from '../interfaces';
import { DB_CONFIG } from '../../../storage/database';
import { IndexedDBConnection } from './IndexedDBConnection';

export class IndexedDBStorageProvider implements IStorageProvider {
  private readonly connection: IndexedDBConnection;

  constructor(factory?: IDBFactory) {
    this.connection = new IndexedDBConnection(
      DB_CONFIG.NAME,
      DB_CONFIG.VERSION,
      (db) => this.upgrade(db),
      factory
    );
  }

  initialize(): Promise<void> {
    return this.connection.initialize();
  }

  close(): Promise<void> {
    return this.connection.close();
  }

  get<T>(storeName: string, key: string): Promise<T | undefined> {
    return this.connection.runTransaction<T | undefined>([storeName], 'readonly', (tx, result) => {
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => result(request.result);
    });
  }

  getAll<T>(storeName: string): Promise<T[]> {
    return this.connection.runTransaction<T[]>([storeName], 'readonly', (tx, result) => {
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => result(request.result);
    });
  }

  put<T>(storeName: string, value: T): Promise<void> {
    return this.connection.runTransaction([storeName], 'readwrite', (tx) => {
      tx.objectStore(storeName).put(value);
    });
  }

  delete(storeName: string, key: string): Promise<void> {
    return this.connection.runTransaction([storeName], 'readwrite', (tx) => {
      tx.objectStore(storeName).delete(key);
    });
  }

  transaction(
    storeNames: string[],
    mode: 'readonly' | 'readwrite',
    callback: (stores: Record<string, IDBObjectStore>) => Promise<void>
  ): Promise<void> {
    return this.connection.runTransaction(storeNames, mode, (tx) => {
      const stores: Record<string, IDBObjectStore> = {};
      for (const name of storeNames) stores[name] = tx.objectStore(name);
      // Requests must be scheduled synchronously or from IndexedDB callbacks.
      // Awaiting unrelated work does not keep an IndexedDB transaction alive.
      return callback(stores);
    });
  }

  private upgrade(db: IDBDatabase): void {
    // Create notebooks store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.NOTEBOOKS)) {
      const notebooksStore = db.createObjectStore(DB_CONFIG.STORES.NOTEBOOKS, {
        keyPath: 'id',
      });
      notebooksStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      notebooksStore.createIndex('accessCount', 'accessCount', { unique: false });
      notebooksStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }

    // Create files metadata store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.FILES_METADATA)) {
      const filesMetaStore = db.createObjectStore(DB_CONFIG.STORES.FILES_METADATA, {
        keyPath: 'id',
      });
      filesMetaStore.createIndex('notebookId', 'notebookId', { unique: false });
      filesMetaStore.createIndex('notebookPath', ['notebookId', 'filePath'], { unique: true });
      filesMetaStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      filesMetaStore.createIndex('storageType', 'storageType', { unique: false });
      filesMetaStore.createIndex('isLargeFile', 'isLargeFile', { unique: false });
      filesMetaStore.createIndex('cachedAt', 'cachedAt', { unique: false });
    }

    // Create files content store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.FILES_CONTENT)) {
      db.createObjectStore(DB_CONFIG.STORES.FILES_CONTENT, { keyPath: 'fileId' });
    }

    // Create activities store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.ACTIVITIES)) {
      const activitiesStore = db.createObjectStore(DB_CONFIG.STORES.ACTIVITIES, {
        keyPath: 'id',
      });
      activitiesStore.createIndex('notebookId', 'notebookId', { unique: false });
      activitiesStore.createIndex('timestamp', 'timestamp', { unique: false });
      activitiesStore.createIndex('notebookTimestamp', ['notebookId', 'timestamp'], {
        unique: false,
      });
      activitiesStore.createIndex('activityType', 'activityType', { unique: false });
    }

    // Create config store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CONFIG)) {
      db.createObjectStore(DB_CONFIG.STORES.CONFIG, { keyPath: 'id' });
    }

    // Create tab states store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.TAB_STATES)) {
      const tabStatesStore = db.createObjectStore(DB_CONFIG.STORES.TAB_STATES, {
        keyPath: 'notebookId',
      });
      tabStatesStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
    }

    // Create split files store
    if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SPLIT_FILES)) {
      const splitFilesStore = db.createObjectStore(DB_CONFIG.STORES.SPLIT_FILES, {
        keyPath: 'id',
      });
      splitFilesStore.createIndex('notebookId', 'notebookId', { unique: false });
      splitFilesStore.createIndex('filePath', 'filePath', { unique: false });
      splitFilesStore.createIndex('cachedAt', 'cachedAt', { unique: false });
    }
  }
}
