import { INotebookRepository, IStorageProvider, type FileSaveData } from '../interfaces';
import { NotebookEntity, NotebookActivityEntity } from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
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
    // This requires a transaction across multiple stores.
    // I need to implement the complex deletion logic here.

    await this.storage.transaction(
      [
        DB_CONFIG.STORES.NOTEBOOKS,
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.FILES_CONTENT,
        DB_CONFIG.STORES.ACTIVITIES,
      ],
      'readwrite',
      async (stores) => {
        // 1. Delete notebook
        stores[DB_CONFIG.STORES.NOTEBOOKS].delete(id);

        // 2. Find and delete files
        // We need to use an index to find files by notebookId.
        // IDBObjectStore in the callback is the raw IDB object.
        const filesMetaStore = stores[DB_CONFIG.STORES.FILES_METADATA];
        const contentStore = stores[DB_CONFIG.STORES.FILES_CONTENT];
        const index = filesMetaStore.index('notebookId');

        // We can't await cursor iteration easily inside this callback structure if we want to be purely async.
        // But we can use getAllKeys if available or just iterate.
        // Let's try getAllKeys from the index if supported (modern browsers).

        const fileKeysRequest = index.getAllKeys(id);

        await new Promise<void>((resolve, reject) => {
          fileKeysRequest.onsuccess = () => {
            const keys = fileKeysRequest.result;
            keys.forEach((key) => {
              filesMetaStore.delete(key);
              contentStore.delete(key);
            });
            resolve();
          };
          fileKeysRequest.onerror = () => reject(fileKeysRequest.error);
        });

        // 3. Delete activities
        const activitiesStore = stores[DB_CONFIG.STORES.ACTIVITIES];
        const actIndex = activitiesStore.index('notebookId');
        const actKeysRequest = actIndex.getAllKeys(id);

        await new Promise<void>((resolve, reject) => {
          actKeysRequest.onsuccess = () => {
            const keys = actKeysRequest.result;
            keys.forEach((key) => {
              activitiesStore.delete(key);
            });
            resolve();
          };
          actKeysRequest.onerror = () => reject(actKeysRequest.error);
        });
      }
    );

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
    // This also requires querying by index.
    // I'll implement a simplified version or extend IStorageProvider if needed.
    // For now, I'll assume I can access the DB directly if I really need to,
    // or just use getAll and filter (inefficient but works for now).

    // Let's use getAll and filter for simplicity in this refactor step,
    // optimizing later if performance is an issue.

    const allFiles = await this.storage.getAll<any>(DB_CONFIG.STORES.FILES_METADATA);
    const notebookFiles = allFiles.filter((f) => f.notebookId === id);

    const fileCount = notebookFiles.length;
    const totalSize = notebookFiles.reduce((sum, f) => sum + f.size, 0);

    const allActivities = await this.storage.getAll<NotebookActivityEntity>(
      DB_CONFIG.STORES.ACTIVITIES
    );
    const notebookActivities = allActivities
      .filter((a) => a.notebookId === id)
      .sort((a, b) => b.timestamp - a.timestamp);

    const lastActivity = notebookActivities.length > 0 ? notebookActivities[0].timestamp : 0;

    return {
      fileCount,
      totalSize,
      lastActivity,
      activities: notebookActivities.slice(0, 50),
    };
  }
}
