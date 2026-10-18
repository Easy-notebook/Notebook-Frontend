import {
  IFileRepository,
  IStorageProvider,
  type FileSaveData,
  type FileSaveOptions,
} from '../interfaces';
import {
  FileMetadataEntity,
  FileContentEntity,
  NotebookEntity,
  NotebookActivityEntity,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { FileRecordSet } from './FileRecordSet';

export class FileRepository implements IFileRepository {
  constructor(private storage: IStorageProvider) {}

  private readonly mutationStores = [
    DB_CONFIG.STORES.FILES_METADATA,
    DB_CONFIG.STORES.FILES_CONTENT,
    DB_CONFIG.STORES.NOTEBOOKS,
    DB_CONFIG.STORES.ACTIVITIES,
  ];

  async saveFile<T extends FileSaveData>(
    fileData: T,
    options: FileSaveOptions = {}
  ): Promise<FileMetadataEntity> {
    if (!fileData.notebookId || !fileData.filePath || !fileData.fileName)
      throw new Error('Invalid file data: notebook identity, path and name are required');
    const records = new FileRecordSet(fileData, options);
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const existing = await this.read<FileMetadataEntity | undefined>(
        stores[DB_CONFIG.STORES.FILES_METADATA].get(records.metadata.id)
      );
      records.writeTo(
        stores[DB_CONFIG.STORES.FILES_METADATA],
        stores[DB_CONFIG.STORES.FILES_CONTENT]
      );
      await this.recordMutation(
        stores,
        fileData.notebookId,
        fileData.filePath,
        existing ? 0 : 1,
        records.metadata.size - (existing?.size || 0),
        'file_create'
      );
    });
    return records.metadata;
  }

  async getFile(
    notebookId: string,
    filePath: string
  ): Promise<{
    metadata: FileMetadataEntity;
    content?: string;
    needsRemoteFetch?: boolean;
  } | null> {
    const fileId = `${notebookId}::${filePath}`;
    let result: Awaited<ReturnType<IFileRepository['getFile']>> = null;
    // Read the revision, update its access counters and read its content under one lock.
    // Separate transactions can overwrite a concurrent save with stale metadata.
    await this.storage.transaction(
      this.mutationStores,
      'readwrite',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const metadataStore = stores[DB_CONFIG.STORES.FILES_METADATA];
          const request = metadataStore.get(fileId);
          request.onerror = () => reject(request.error);
          request.onsuccess = async () => {
            try {
              const metadata = request.result as FileMetadataEntity | undefined;
              if (!metadata) {
                resolve();
                return;
              }
              metadata.lastAccessedAt = Date.now();
              metadata.accessCount += 1;
              metadataStore.put(metadata);
              await this.recordAccess(stores, notebookId, filePath);
              result = { metadata, needsRemoteFetch: true };
              if (!metadata.hasLocalContent) {
                resolve();
                return;
              }
              const content = stores[DB_CONFIG.STORES.FILES_CONTENT].get(fileId);
              content.onerror = () => reject(content.error);
              content.onsuccess = () => {
                const entity = content.result as FileContentEntity | undefined;
                if (entity) result = { metadata, content: entity.content, needsRemoteFetch: false };
                resolve();
              };
            } catch (error) {
              reject(error);
            }
          };
        })
    );
    return result;
  }

  async getFilesForNotebook(notebookId: string, includeContent = false): Promise<any[]> {
    let results: Array<{
      metadata: FileMetadataEntity;
      content?: string;
      needsRemoteFetch: boolean;
    }> = [];
    const storeNames: string[] = [DB_CONFIG.STORES.FILES_METADATA];
    if (includeContent) storeNames.push(DB_CONFIG.STORES.FILES_CONTENT);
    await this.storage.transaction(
      storeNames,
      'readonly',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const request = stores[DB_CONFIG.STORES.FILES_METADATA]
            .index('notebookId')
            .getAll(notebookId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            try {
              const metadata = request.result as FileMetadataEntity[];
              results = metadata.map((metadata) => ({
                metadata,
                content: undefined,
                needsRemoteFetch: !metadata.hasLocalContent,
              }));
              let pending = 0;
              if (includeContent) {
                for (const file of results) {
                  if (!file.metadata.hasLocalContent) continue;
                  const content = stores[DB_CONFIG.STORES.FILES_CONTENT].get(file.metadata.id);
                  pending++;
                  content.onerror = () => reject(content.error);
                  content.onsuccess = () => {
                    const entity = content.result as FileContentEntity | undefined;
                    file.content = entity?.content;
                    file.needsRemoteFetch = !entity;
                    if (--pending === 0) resolve();
                  };
                }
              }
              if (pending === 0) resolve();
            } catch (error) {
              reject(error);
            }
          };
        })
    );
    return results;
  }

  async deleteFile(notebookId: string, filePath: string): Promise<boolean> {
    const fileId = `${notebookId}::${filePath}`;
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const metadata = stores[DB_CONFIG.STORES.FILES_METADATA];
      const previous = await this.read<FileMetadataEntity | undefined>(metadata.get(fileId));
      metadata.delete(fileId);
      stores[DB_CONFIG.STORES.FILES_CONTENT].delete(fileId);
      if (previous)
        await this.recordMutation(
          stores,
          notebookId,
          filePath,
          -1,
          -(previous.size || 0),
          'file_delete'
        );
    });
    return true;
  }

  async updateFileContent(notebookId: string, filePath: string, content: string): Promise<boolean> {
    const fileId = `${notebookId}::${filePath}`;
    const size = new Blob([content]).size;
    let updated = false;
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const metadataStore = stores[DB_CONFIG.STORES.FILES_METADATA];
      const metadata = await this.read<FileMetadataEntity | undefined>(metadataStore.get(fileId));
      if (!metadata) return;
      const now = Date.now();
      metadataStore.put({
        ...metadata,
        hasLocalContent: true,
        storageType: 'local',
        size,
        lastModified: new Date(now).toISOString(),
        lastAccessedAt: now,
      } satisfies FileMetadataEntity);
      stores[DB_CONFIG.STORES.FILES_CONTENT].put({
        fileId,
        content,
        compressed: false,
        encoding: 'utf8',
      } satisfies FileContentEntity);
      await this.recordMutation(
        stores,
        notebookId,
        filePath,
        0,
        size - (metadata.size || 0),
        'file_create'
      );
      updated = true;
    });
    return updated;
  }

  async getLargeFiles(notebookId?: string): Promise<FileMetadataEntity[]> {
    let files: FileMetadataEntity[] = [];
    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA],
      'readonly',
      async (stores) => {
        const store = stores[DB_CONFIG.STORES.FILES_METADATA];
        // IndexedDB keys cannot be booleans; filter flags after an optional notebook index query.
        files = await this.read<FileMetadataEntity[]>(
          notebookId ? store.index('notebookId').getAll(notebookId) : store.getAll()
        );
      }
    );
    return files.filter((file) => file.isLargeFile);
  }

  private async recordAccess(
    stores: Record<string, IDBObjectStore>,
    notebookId: string,
    filePath: string
  ): Promise<void> {
    const now = Date.now();
    const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
    const notebook = await this.read<NotebookEntity | undefined>(store.get(notebookId));
    if (notebook)
      store.put({ ...notebook, lastAccessedAt: now, accessCount: notebook.accessCount + 1 });
    stores[DB_CONFIG.STORES.ACTIVITIES].put({
      id: `${notebookId}::${now}::${filePath}`,
      notebookId,
      filePath,
      activityType: 'file_access',
      timestamp: now,
    } satisfies NotebookActivityEntity);
  }

  private async recordMutation(
    stores: Record<string, IDBObjectStore>,
    notebookId: string,
    filePath: string,
    deltaCount: number,
    deltaBytes: number,
    activityType: NotebookActivityEntity['activityType']
  ): Promise<void> {
    const now = Date.now();
    stores[DB_CONFIG.STORES.ACTIVITIES].put({
      id: `${notebookId}::${now}::${filePath}`,
      notebookId,
      filePath,
      activityType,
      timestamp: now,
    } satisfies NotebookActivityEntity);
    const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
    const notebook = await this.read<NotebookEntity | undefined>(store.get(notebookId));
    if (notebook)
      store.put({
        ...notebook,
        fileCount: Math.max(0, (notebook.fileCount || 0) + deltaCount),
        totalSize: Math.max(0, (notebook.totalSize || 0) + deltaBytes),
        updatedAt: now,
      });
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
