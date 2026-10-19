import { makeFileId } from '../../../storage/fileIdentity';
import { ISplitFileRepository, IStorageProvider, type SplitFileSaveData } from '../interfaces';
import { SplitFileEntity, DB_STORES } from '../../../storage/schema';

export class SplitFileRepository implements ISplitFileRepository {
  constructor(private storage: IStorageProvider) {}

  async saveFile(notebookId: string, filePath: string, fileData: SplitFileSaveData): Promise<void> {
    if (
      typeof notebookId !== 'string' ||
      !notebookId ||
      typeof filePath !== 'string' ||
      !filePath ||
      !fileData ||
      typeof fileData.name !== 'string' ||
      !fileData.name ||
      typeof fileData.content !== 'string' ||
      typeof fileData.type !== 'string' ||
      !fileData.type ||
      typeof fileData.lastModified !== 'string' ||
      !fileData.lastModified
    ) {
      throw new Error(
        'Invalid split file: identity, name, content, type and modification time are required'
      );
    }
    if (!Number.isSafeInteger(fileData.size) || fileData.size < 0) {
      throw new Error('Invalid split file size');
    }
    const splitFile: SplitFileEntity = {
      id: makeFileId(notebookId, filePath),
      notebookId,
      filePath,
      fileName: fileData.name,
      content: fileData.content,
      type: fileData.type,
      size: fileData.size,
      lastModified: fileData.lastModified,
      cachedAt: Date.now(),
      metadata: fileData.metadata,
    };

    await this.storage.put(DB_STORES.SPLIT_FILES, splitFile);
  }

  async getFile(notebookId: string, filePath: string): Promise<SplitFileEntity | null> {
    const id = makeFileId(notebookId, filePath);
    const file = await this.storage.get<SplitFileEntity>(DB_STORES.SPLIT_FILES, id);
    return file || null;
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
    const allFiles = await this.storage.getAll<SplitFileEntity>(DB_STORES.SPLIT_FILES);
    return {
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((sum, f) => sum + f.size, 0),
    };
  }
}
