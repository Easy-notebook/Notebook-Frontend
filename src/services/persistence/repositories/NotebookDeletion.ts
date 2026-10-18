import { DB_STORES, type FileMetadataEntity } from '../../../storage/schema';

/** Cascades notebook-owned records inside the caller's transaction. */
export class NotebookDeletion {
  static readonly stores = [
    DB_STORES.NOTEBOOKS,
    DB_STORES.FILES_METADATA,
    DB_STORES.FILES_CONTENT,
    DB_STORES.ACTIVITIES,
    DB_STORES.TAB_STATES,
    DB_STORES.SPLIT_FILES,
  ];

  constructor(private readonly stores: Record<string, IDBObjectStore>) {}

  async delete(id: string): Promise<{ filesDeleted: number; bytesFreed: number }> {
    const files = await this.read<FileMetadataEntity[]>(
      this.stores[DB_STORES.FILES_METADATA].index('notebookId').getAll(id)
    );
    for (const file of files) {
      this.stores[DB_STORES.FILES_METADATA].delete(file.id);
      this.stores[DB_STORES.FILES_CONTENT].delete(file.id);
    }
    await Promise.all(
      [DB_STORES.ACTIVITIES, DB_STORES.SPLIT_FILES].map(async (name) => {
        const store = this.stores[name];
        const keys = await this.read(store.index('notebookId').getAllKeys(id));
        for (const key of keys) store.delete(key);
      })
    );
    this.stores[DB_STORES.TAB_STATES].delete(id);
    this.stores[DB_STORES.NOTEBOOKS].delete(id);
    return {
      filesDeleted: files.length,
      bytesFreed: files.reduce((sum, file) => sum + file.size, 0),
    };
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
