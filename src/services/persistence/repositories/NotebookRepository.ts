import { INotebookRepository, IStorageProvider, type FileSaveData } from '../interfaces';
import {
  NotebookEntity,
  NotebookActivityEntity,
  FileMetadataEntity,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { NotebookDeletion } from './NotebookDeletion';
import { FileRecordSet } from './FileRecordSet';

export class NotebookRepository implements INotebookRepository {
  constructor(private storage: IStorageProvider) {}

  async saveNotebook(
    notebookData: Omit<NotebookEntity, 'createdAt' | 'updatedAt'>
  ): Promise<NotebookEntity> {
    return this.persistNotebook(notebookData);
  }

  async saveNotebookSnapshot(
    file: FileSaveData,
    notebook: Omit<NotebookEntity, 'createdAt' | 'updatedAt'>
  ) {
    if (file.notebookId !== notebook.id) throw new Error('Snapshot notebook identity mismatch');
    const records = new FileRecordSet(file, { forceLocal: true });
    await this.persistNotebook(notebook, records);
    return records.metadata;
  }

  private async persistNotebook(
    data: Omit<NotebookEntity, 'createdAt' | 'updatedAt'>,
    file?: FileRecordSet
  ): Promise<NotebookEntity> {
    const names: string[] = [DB_CONFIG.STORES.NOTEBOOKS, DB_CONFIG.STORES.ACTIVITIES];
    if (file) names.push(DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT);
    let notebook!: NotebookEntity;
    await this.storage.transaction(
      names,
      'readwrite',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const notebooks = stores[DB_CONFIG.STORES.NOTEBOOKS];
          const request = notebooks.get(data.id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            try {
              const now = Date.now();
              const existing = request.result as NotebookEntity | undefined;
              notebook = { ...data, createdAt: existing?.createdAt ?? now, updatedAt: now };
              notebooks.put(notebook);
              const activity: NotebookActivityEntity = {
                id: `${data.id}::${now}`,
                notebookId: data.id,
                activityType: 'open',
                timestamp: now,
              };
              stores[DB_CONFIG.STORES.ACTIVITIES].put(activity);
              file?.writeTo(
                stores[DB_CONFIG.STORES.FILES_METADATA],
                stores[DB_CONFIG.STORES.FILES_CONTENT]
              );
              resolve();
            } catch (error) {
              reject(error);
            }
          };
        })
    );
    return notebook;
  }

  async getNotebook(id: string): Promise<NotebookEntity | null> {
    return (await this.accessNotebook(id)) ?? null;
  }

  async getAllNotebooks(
    options: { orderBy?: string; limit?: number; offset?: number } = {}
  ): Promise<NotebookEntity[]> {
    // Note: IndexedDB getAll doesn't support sorting/pagination natively in a simple way without cursors.
    // The IStorageProvider interface I defined is simple.
    // For now, I will fetch all and sort/filter in memory, or I would need to expand IStorageProvider.
    // Given the scale (likely < 1000 notebooks), in-memory sorting is acceptable for this refactor.
    // Ideally, IStorageProvider should expose openCursor.

    const notebooks = await this.storage.getAll<NotebookEntity>(DB_CONFIG.STORES.NOTEBOOKS);

    if (options.orderBy) {
      notebooks.sort((a, b) => {
        const valA = (a as any)[options.orderBy!];
        const valB = (b as any)[options.orderBy!];
        return valB - valA; // Descending
      });
    } else {
      // Default sort by lastAccessedAt
      notebooks.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    }

    let result = notebooks;
    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async deleteNotebook(id: string): Promise<boolean> {
    await this.storage.transaction(NotebookDeletion.stores, 'readwrite', async (stores) => {
      await new NotebookDeletion(stores).delete(id);
    });
    return true;
  }

  async updateAccessTime(id: string): Promise<void> {
    await this.accessNotebook(id);
  }

  private async accessNotebook(id: string): Promise<NotebookEntity | undefined> {
    let notebook: NotebookEntity | undefined;
    await this.storage.transaction(
      [DB_CONFIG.STORES.NOTEBOOKS],
      'readwrite',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
          const request = store.get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            try {
              notebook = request.result as NotebookEntity | undefined;
              if (notebook) {
                notebook.lastAccessedAt = Date.now();
                notebook.accessCount += 1;
                store.put(notebook);
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          };
        })
    );
    return notebook;
  }

  async getNotebookStats(id: string): Promise<{
    fileCount: number;
    totalSize: number;
    lastActivity: number;
    activities: NotebookActivityEntity[];
  }> {
    let files: FileMetadataEntity[] = [];
    let activities: NotebookActivityEntity[] = [];
    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.ACTIVITIES],
      'readonly',
      async (stores) => {
        [files, activities] = await Promise.all([
          this.read<FileMetadataEntity[]>(
            stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(id)
          ),
          this.read<NotebookActivityEntity[]>(
            stores[DB_CONFIG.STORES.ACTIVITIES].index('notebookId').getAll(id)
          ),
        ]);
      }
    );
    activities.sort((a, b) => b.timestamp - a.timestamp);
    return {
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      lastActivity: activities[0]?.timestamp ?? 0,
      activities: activities.slice(0, 50),
    };
  }

  async logActivity(
    notebookId: string,
    activityType: NotebookActivityEntity['activityType'],
    filePath?: string,
    metadata?: NotebookActivityEntity['metadata']
  ): Promise<void> {
    const timestamp = Date.now();
    await this.storage.put(DB_CONFIG.STORES.ACTIVITIES, {
      id: `${notebookId}::${timestamp}`,
      notebookId,
      activityType,
      filePath,
      timestamp,
      metadata,
    });
  }

  async getInactiveNotebooks(retentionPeriod: number): Promise<NotebookEntity[]> {
    let notebooks: NotebookEntity[] = [];
    await this.storage.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readonly', async (stores) => {
      notebooks = await this.read<NotebookEntity[]>(
        stores[DB_CONFIG.STORES.NOTEBOOKS]
          .index('lastAccessedAt')
          .getAll(IDBKeyRange.upperBound(Date.now() - retentionPeriod))
      );
    });
    return notebooks;
  }

  async adjustNotebookStats(
    notebookId: string,
    deltaFileCount: number,
    deltaBytes: number
  ): Promise<void> {
    await this.storage.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readwrite', async (stores) => {
      const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
      const notebook = await this.read<NotebookEntity | undefined>(store.get(notebookId));
      if (!notebook) return;
      store.put({
        ...notebook,
        fileCount: Math.max(0, (notebook.fileCount || 0) + (deltaFileCount || 0)),
        totalSize: Math.max(0, (notebook.totalSize || 0) + (deltaBytes || 0)),
        updatedAt: Date.now(),
      });
    });
  }

  async recalcNotebookStats(notebookId: string): Promise<void> {
    await this.storage.transaction(
      [DB_CONFIG.STORES.NOTEBOOKS, DB_CONFIG.STORES.FILES_METADATA],
      'readwrite',
      async (stores) => {
        const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
        const [notebook, files] = await Promise.all([
          this.read<NotebookEntity | undefined>(store.get(notebookId)),
          this.read<FileMetadataEntity[]>(
            stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(notebookId)
          ),
        ]);
        if (!notebook) return;
        store.put({
          ...notebook,
          fileCount: files.length,
          totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
          updatedAt: Date.now(),
        });
      }
    );
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
