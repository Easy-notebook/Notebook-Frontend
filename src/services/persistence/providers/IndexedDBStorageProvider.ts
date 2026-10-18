import type { IStorageProvider } from '../interfaces';
import { NotebookDatabaseSchema } from '../../../storage/NotebookDatabaseSchema';
import { DB_CONFIG } from '../../../storage/database';
import { IndexedDBConnection } from './IndexedDBConnection';

export class IndexedDBStorageProvider implements IStorageProvider {
  private readonly connection: IndexedDBConnection;

  constructor(factory?: IDBFactory) {
    this.connection = new IndexedDBConnection(
      DB_CONFIG.NAME,
      DB_CONFIG.VERSION,
      (db, transaction) => NotebookDatabaseSchema.upgrade(db, transaction),
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

  async put<T>(storeName: string, value: T): Promise<void> {
    const snapshot = structuredClone(value);
    return this.connection.runTransaction([storeName], 'readwrite', (tx) => {
      tx.objectStore(storeName).put(snapshot);
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
    const names = [...storeNames];
    return this.connection.runTransaction(names, mode, (tx) => {
      const stores: Record<string, IDBObjectStore> = {};
      for (const name of names) stores[name] = tx.objectStore(name);
      // Requests must be scheduled synchronously or from IndexedDB callbacks.
      // Awaiting unrelated work does not keep an IndexedDB transaction alive.
      return callback(stores);
    });
  }
}
