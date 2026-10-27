import { SplitFileRecord } from './SplitFileRecord';
import { makeFileId } from '../../../storage/fileIdentity';
import { ISplitFileRepository, IStorageProvider, type SplitFileSaveData } from '../interfaces';
import { SplitFileEntity, DB_STORES } from '../../../storage/schema';

export class SplitFileRepository implements ISplitFileRepository {
  constructor(private storage: IStorageProvider) {}

  async saveFile(notebookId: string, filePath: string, fileData: SplitFileSaveData): Promise<void> {
    const splitFile = new SplitFileRecord({
      id: makeFileId(notebookId, filePath),
      notebookId,
      filePath,
      fileName: fileData?.name,
      content: fileData?.content,
      type: fileData?.type,
      size: fileData?.size,
      lastModified: fileData?.lastModified,
      cachedAt: Date.now(),
      metadata: fileData?.metadata,
    }).toRecord();

    await this.storage.put(DB_STORES.SPLIT_FILES, splitFile);
  }

  async updateFileContent(notebookId: string, filePath: string, content: string): Promise<boolean> {
    if (typeof content !== 'string') throw new Error('Invalid split file content');
    const id = makeFileId(notebookId, filePath);
    let updated = false;
    await this.storage.transaction([DB_STORES.SPLIT_FILES], 'readwrite', async (stores) => {
      const store = stores[DB_STORES.SPLIT_FILES];
      const record = await new Promise<unknown>((resolve, reject) => {
        const request = store.get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      if (record == null) return;
      const validated = new SplitFileRecord(record, id).toRecord();
      store.put({
        ...validated,
        content,
        size: new Blob([content]).size,
        lastModified: new Date().toISOString(),
      });
      updated = true;
    });
    return updated;
  }

  async getFile(notebookId: string, filePath: string): Promise<SplitFileEntity | null> {
    const id = makeFileId(notebookId, filePath);
    const file = await this.storage.get<unknown>(DB_STORES.SPLIT_FILES, id);
    return file == null ? null : new SplitFileRecord(file, id).toRecord();
  }

  async deleteFile(notebookId: string, filePath: string): Promise<void> {
    const id = makeFileId(notebookId, filePath);
    await this.storage.delete(DB_STORES.SPLIT_FILES, id);
  }

  async clearNotebook(notebookId: string): Promise<void> {
    await this.storage.transaction([DB_STORES.SPLIT_FILES], 'readwrite', (stores) => {
      const store = stores[DB_STORES.SPLIT_FILES];
      return new Promise<void>((resolve, reject) => {
        const request = store.index('notebookId').openKeyCursor(IDBKeyRange.only(notebookId));
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
      });
    });
  }

  async clearAll(): Promise<void> {
    await this.storage.transaction([DB_STORES.SPLIT_FILES], 'readwrite', async (stores) => {
      stores[DB_STORES.SPLIT_FILES].clear();
    });
  }

  async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    const records = await this.storage.getAll<unknown>(DB_STORES.SPLIT_FILES);
    const allFiles = records.map((record) => new SplitFileRecord(record).toRecord());
    return {
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((sum, f) => sum + f.size, 0),
    };
  }
}
