import type { IStorageProvider, IStorageMaintenanceRepository } from '../interfaces';
import {
  DB_STORES,
  DEFAULT_STORAGE_CONFIG,
  type StorageConfigEntity,
} from '../../../storage/schema';

/** Configuration and retention maintenance use the same transaction owner as content. */
export class StorageMaintenanceRepository implements IStorageMaintenanceRepository {
  constructor(private readonly storage: IStorageProvider) {}

  async getConfig(): Promise<StorageConfigEntity> {
    return (
      (await this.storage.get<StorageConfigEntity>(DB_STORES.CONFIG, 'config')) ?? {
        ...DEFAULT_STORAGE_CONFIG,
      }
    );
  }

  async ensureConfig(): Promise<void> {
    await this.storage.transaction([DB_STORES.CONFIG], 'readwrite', async (stores) => {
      const store = stores[DB_STORES.CONFIG];
      if (!(await this.read<StorageConfigEntity | undefined>(store.get('config'))))
        store.put({ ...DEFAULT_STORAGE_CONFIG });
    });
  }

  async updateConfig(patch: Partial<StorageConfigEntity>): Promise<void> {
    await this.storage.transaction([DB_STORES.CONFIG], 'readwrite', async (stores) => {
      const store = stores[DB_STORES.CONFIG];
      const current = await this.read<StorageConfigEntity | undefined>(store.get('config'));
      store.put({ ...DEFAULT_STORAGE_CONFIG, ...current, ...patch, id: 'config' });
    });
  }

  async cleanupActivities(retentionPeriod: number): Promise<void> {
    const cutoff = Date.now() - retentionPeriod;
    await this.storage.transaction(
      [DB_STORES.ACTIVITIES],
      'readwrite',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const store = stores[DB_STORES.ACTIVITIES];
          const request = store.index('timestamp').openKeyCursor(IDBKeyRange.upperBound(cutoff));
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
              resolve();
              return;
            }
            store.delete(cursor.primaryKey);
            cursor.continue();
          };
        })
    );
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
