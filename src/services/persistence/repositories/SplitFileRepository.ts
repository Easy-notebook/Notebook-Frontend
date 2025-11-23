import { ISplitFileRepository, IStorageProvider } from '../interfaces';
import { SplitFileEntity, DB_STORES } from '../../../storage/schema';

export class SplitFileRepository implements ISplitFileRepository {
  constructor(private storage: IStorageProvider) {}

  async saveFile(notebookId: string, filePath: string, fileData: any): Promise<void> {
    const splitFile: SplitFileEntity = {
      id: `${notebookId}::${filePath}`,
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
    const id = `${notebookId}::${filePath}`;
    const file = await this.storage.get<SplitFileEntity>(DB_STORES.SPLIT_FILES, id);
    return file || null;
  }

  async deleteFile(notebookId: string, filePath: string): Promise<void> {
    const id = `${notebookId}::${filePath}`;
    await this.storage.delete(DB_STORES.SPLIT_FILES, id);
  }

  async clearNotebook(notebookId: string): Promise<void> {
    // This is inefficient without a proper index query support in IStorageProvider
    // But for now we can iterate or we need to extend IStorageProvider
    // Since IStorageProvider has transaction support, we can use that if we want to be efficient
    // But getAll is simpler for now given the likely small number of split files

    const allFiles = await this.storage.getAll<SplitFileEntity>(DB_STORES.SPLIT_FILES);
    const notebookFiles = allFiles.filter((f) => f.notebookId === notebookId);

    await Promise.all(notebookFiles.map((f) => this.storage.delete(DB_STORES.SPLIT_FILES, f.id)));
  }

  async clearAll(): Promise<void> {
    // We need a clear method in IStorageProvider or just iterate and delete
    // For now, let's assume we can iterate.
    // Ideally IStorageProvider should have a clearStore method.
    // Let's just use getAll and delete for now.
    const allFiles = await this.storage.getAll<SplitFileEntity>(DB_STORES.SPLIT_FILES);
    await Promise.all(allFiles.map((f) => this.storage.delete(DB_STORES.SPLIT_FILES, f.id)));
  }

  async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    const allFiles = await this.storage.getAll<SplitFileEntity>(DB_STORES.SPLIT_FILES);
    return {
      totalFiles: allFiles.length,
      totalSize: allFiles.reduce((sum, f) => sum + f.size, 0),
    };
  }
}
