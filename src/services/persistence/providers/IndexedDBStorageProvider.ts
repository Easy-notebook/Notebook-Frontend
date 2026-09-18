import { IStorageProvider } from '../interfaces';
import { DB_CONFIG } from '../../../storage/database';

export class IndexedDBStorageProvider implements IStorageProvider {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => {
          this.db = null;
          this.initPromise = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        // Reuse the upgrade logic from the original implementation if possible,
        // or re-implement it here. For now, I'll assume the DB is already set up
        // or use a simplified version since we are refactoring.
        // Ideally, we should extract the schema creation logic.
        // For this refactor, I will rely on the existing schema creation
        // if it's already there, or copy it.
        // Since we are refactoring, let's copy the schema creation logic to be safe.

        const db = (event.target as IDBOpenDBRequest).result;

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
      };
    });

    return this.initPromise;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Storage transaction aborted'));
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Storage transaction aborted'));
    });
  }

  async transaction(
    storeNames: string[],
    mode: 'readonly' | 'readwrite',
    callback: (stores: Record<string, IDBObjectStore>) => Promise<void>
  ): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeNames, mode);
      const stores: Record<string, IDBObjectStore> = {};

      storeNames.forEach((name) => {
        stores[name] = transaction.objectStore(name);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Storage transaction aborted'));
      const abort = (error: unknown) => {
        try {
          transaction.abort();
        } catch {
          /* Already committed or aborted. */
        }
        reject(error);
      };
      // Callers must schedule requests synchronously or from IDB callbacks;
      // arbitrary awaited work cannot keep an IndexedDB transaction alive.
      try {
        Promise.resolve(callback(stores)).catch(abort);
      } catch (error) {
        abort(error);
      }
    });
  }
}
