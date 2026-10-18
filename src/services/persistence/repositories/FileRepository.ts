import { IFileRepository, IStorageProvider } from '../interfaces';
import { FileMetadataEntity, FileContentEntity } from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { FileRecordSet } from './FileRecordSet';

export class FileRepository implements IFileRepository {
  constructor(private storage: IStorageProvider) {}

  async saveFile(fileData: any, options: any = {}): Promise<FileMetadataEntity> {
    const records = new FileRecordSet(fileData, options);

    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT],
      'readwrite',
      async (stores) => {
        records.writeTo(
          stores[DB_CONFIG.STORES.FILES_METADATA],
          stores[DB_CONFIG.STORES.FILES_CONTENT]
        );
      }
    );

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
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT],
      'readwrite',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const metadataStore = stores[DB_CONFIG.STORES.FILES_METADATA];
          const request = metadataStore.get(fileId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            try {
              const metadata = request.result as FileMetadataEntity | undefined;
              if (!metadata) {
                resolve();
                return;
              }
              metadata.lastAccessedAt = Date.now();
              metadata.accessCount += 1;
              metadataStore.put(metadata);
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

    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT],
      'readwrite',
      async (stores) => {
        stores[DB_CONFIG.STORES.FILES_METADATA].delete(fileId);
        stores[DB_CONFIG.STORES.FILES_CONTENT].delete(fileId);
      }
    );

    return true;
  }

  async updateFileContent(notebookId: string, filePath: string, content: string): Promise<boolean> {
    const fileId = `${notebookId}::${filePath}`;
    // Prepare payload work before taking the write lock.
    const size = new Blob([content]).size;
    let updated = false;
    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT],
      'readwrite',
      (stores) =>
        new Promise<void>((resolve, reject) => {
          const metadataStore = stores[DB_CONFIG.STORES.FILES_METADATA];
          const request = metadataStore.get(fileId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            try {
              const metadata = request.result as FileMetadataEntity | undefined;
              if (!metadata) {
                resolve();
                return;
              }
              const now = Date.now();
              metadataStore.put({
                ...metadata,
                hasLocalContent: true,
                storageType: 'local',
                size,
                lastModified: new Date(now).toISOString(),
                lastAccessedAt: now,
              } satisfies FileMetadataEntity);
              const contentEntity: FileContentEntity = {
                fileId,
                content,
                compressed: false,
                encoding: 'utf8',
              };
              stores[DB_CONFIG.STORES.FILES_CONTENT].put(contentEntity);
              updated = true;
              resolve();
            } catch (error) {
              reject(error);
            }
          };
        })
    );
    return updated;
  }
}
