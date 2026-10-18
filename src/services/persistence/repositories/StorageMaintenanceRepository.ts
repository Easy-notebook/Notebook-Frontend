import { StorageUsage, type StorageStats } from '../../../storage/StorageUsage';
import { NotebookDeletion } from './NotebookDeletion';
import {
  NotebookRetentionPolicy,
  type CleanupMode,
  type CleanupStats,
  type CleanupCandidates,
} from '../../../storage/NotebookRetentionPolicy';
import type { IStorageProvider, IStorageMaintenanceRepository } from '../interfaces';
import {
  DB_STORES,
  DEFAULT_STORAGE_CONFIG,
  type StorageConfigEntity,
  type NotebookEntity,
  type FileMetadataEntity,
  type FileContentEntity,
  type SplitFileEntity,
} from '../../../storage/schema';

/** Configuration and retention maintenance use the same transaction owner as content. */
export class StorageMaintenanceRepository implements IStorageMaintenanceRepository {
  constructor(private readonly storage: IStorageProvider) {}

  async getStorageStats(): Promise<StorageStats> {
    let usage!: StorageUsage;
    await this.storage.transaction(
      [
        DB_STORES.NOTEBOOKS,
        DB_STORES.FILES_METADATA,
        DB_STORES.FILES_CONTENT,
        DB_STORES.SPLIT_FILES,
      ],
      'readonly',
      async (stores) => {
        const [notebooks, files] = await Promise.all([
          this.read<NotebookEntity[]>(stores[DB_STORES.NOTEBOOKS].getAll()),
          this.read<FileMetadataEntity[]>(stores[DB_STORES.FILES_METADATA].getAll()),
        ]);
        usage = new StorageUsage(notebooks, files);
        await Promise.all([
          this.visit<FileContentEntity>(stores[DB_STORES.FILES_CONTENT], (content) =>
            usage.addFileContent(content)
          ),
          this.visit<SplitFileEntity>(stores[DB_STORES.SPLIT_FILES], (content) =>
            usage.addSplitContent(content)
          ),
        ]);
      }
    );
    return usage.toStats();
  }

  private visit<T>(store: IDBObjectStore, consume: (record: T) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          consume(cursor.value as T);
          cursor.continue();
        } catch (error) {
          reject(error);
        }
      };
    });
  }

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

  async getCleanupCandidates(): Promise<CleanupCandidates> {
    let result!: CleanupCandidates;
    await this.storage.transaction(
      [DB_STORES.CONFIG, DB_STORES.NOTEBOOKS, DB_STORES.FILES_METADATA],
      'readonly',
      async (stores) => {
        const [config, notebooks, files] = await Promise.all([
          this.read<StorageConfigEntity | undefined>(stores[DB_STORES.CONFIG].get('config')),
          this.read<NotebookEntity[]>(stores[DB_STORES.NOTEBOOKS].getAll()),
          this.read<FileMetadataEntity[]>(stores[DB_STORES.FILES_METADATA].getAll()),
        ]);
        const selected = new NotebookRetentionPolicy(config ?? DEFAULT_STORAGE_CONFIG).select(
          notebooks,
          Date.now()
        );
        const ids = new Set([...selected.inactive, ...selected.excess].map((book) => book.id));
        result = {
          ...selected,
          totalBytesToFree: files.reduce(
            (sum, file) => sum + (ids.has(file.notebookId) ? file.size : 0),
            0
          ),
        };
      }
    );
    return result;
  }

  async cleanup(mode: CleanupMode = 'regular'): Promise<CleanupStats> {
    const started = Date.now();
    const stats: CleanupStats = {
      notebooksDeleted: 0,
      filesDeleted: 0,
      bytesFreed: 0,
      duration: 0,
    };
    await this.storage.transaction(
      [DB_STORES.CONFIG, ...NotebookDeletion.stores],
      'readwrite',
      async (stores) => {
        const [stored, notebooks] = await Promise.all([
          this.read<StorageConfigEntity | undefined>(stores[DB_STORES.CONFIG].get('config')),
          this.read<NotebookEntity[]>(stores[DB_STORES.NOTEBOOKS].getAll()),
        ]);
        const config = stored ?? DEFAULT_STORAGE_CONFIG;
        const now = Date.now();
        const selected = new NotebookRetentionPolicy(config).select(notebooks, now, mode);
        const deletion = new NotebookDeletion(stores);
        for (const notebook of [...selected.inactive, ...selected.excess]) {
          const deleted = await deletion.delete(notebook.id);
          stats.notebooksDeleted++;
          stats.filesDeleted += deleted.filesDeleted;
          stats.bytesFreed += deleted.bytesFreed;
        }
        if (mode === 'regular') {
          await this.deleteExpiredActivities(
            stores[DB_STORES.ACTIVITIES],
            now - config.retentionPeriod
          );
          stores[DB_STORES.CONFIG].put({ ...config, lastCleanup: now });
        }
      }
    );
    stats.duration = Date.now() - started;
    return stats;
  }

  async cleanupActivities(retentionPeriod: number): Promise<void> {
    await this.storage.transaction([DB_STORES.ACTIVITIES], 'readwrite', (stores) =>
      this.deleteExpiredActivities(stores[DB_STORES.ACTIVITIES], Date.now() - retentionPeriod)
    );
  }

  private async deleteExpiredActivities(store: IDBObjectStore, cutoff: number): Promise<void> {
    const keys = await this.read(
      store.index('timestamp').getAllKeys(IDBKeyRange.upperBound(cutoff))
    );
    for (const key of keys) store.delete(key);
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
