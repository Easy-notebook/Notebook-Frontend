import { IFileRepository, IStorageProvider } from '../interfaces';
import {
  FileMetadataEntity,
  FileContentEntity,
  DEFAULT_STORAGE_CONFIG,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { getFileType } from '../../../storage/fileTypes';

export class FileRepository implements IFileRepository {
  constructor(private storage: IStorageProvider) {}

  async saveFile(fileData: any, options: any = {}): Promise<FileMetadataEntity> {
    const config = {
      maxFileSize: options.maxFileSize ?? DEFAULT_STORAGE_CONFIG.maxFileSize,
      compressionEnabled: options.compressionEnabled ?? DEFAULT_STORAGE_CONFIG.compressionEnabled,
      forceLocal: options.forceLocal ?? false,
    };

    const fileId = `${fileData.notebookId}::${fileData.filePath}`;
    const isLargeFile = fileData.size > config.maxFileSize && !config.forceLocal;
    const now = Date.now();

    const metadata: FileMetadataEntity = {
      id: fileId,
      notebookId: fileData.notebookId,
      filePath: fileData.filePath,
      fileName: fileData.fileName,
      fileType: getFileType(fileData.filePath),
      size: fileData.size,
      lastModified: fileData.lastModified,
      cachedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      storageType: isLargeFile ? 'remote' : 'local',
      hasLocalContent: !isLargeFile,
      remoteUrl: fileData.remoteUrl,
      isLargeFile,
      contentPreview: isLargeFile ? this.generateContentPreview(fileData.content) : undefined,
    };

    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT],
      'readwrite',
      async (stores) => {
        stores[DB_CONFIG.STORES.FILES_METADATA].put(metadata);

        if (!isLargeFile) {
          const content: FileContentEntity = {
            fileId,
            content: fileData.content, // Compression logic omitted for brevity
            compressed: false,
            encoding: 'utf8', // Simplified
          };
          stores[DB_CONFIG.STORES.FILES_CONTENT].put(content);
        }
      }
    );

    return metadata;
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
    const metadata = await this.storage.get<FileMetadataEntity>(
      DB_CONFIG.STORES.FILES_METADATA,
      fileId
    );

    if (!metadata) return null;

    // Update access stats
    metadata.lastAccessedAt = Date.now();
    metadata.accessCount += 1;
    await this.storage.put(DB_CONFIG.STORES.FILES_METADATA, metadata);

    if (metadata.hasLocalContent) {
      const contentEntity = await this.storage.get<FileContentEntity>(
        DB_CONFIG.STORES.FILES_CONTENT,
        fileId
      );
      if (contentEntity) {
        return {
          metadata,
          content: contentEntity.content,
          needsRemoteFetch: false,
        };
      }
    }

    return {
      metadata,
      needsRemoteFetch: true,
    };
  }

  async getFilesForNotebook(notebookId: string, includeContent = false): Promise<any[]> {
    // Inefficient but functional for refactor: get all and filter
    const allFiles = await this.storage.getAll<FileMetadataEntity>(DB_CONFIG.STORES.FILES_METADATA);
    const notebookFiles = allFiles.filter((f) => f.notebookId === notebookId);

    const results = [];
    for (const metadata of notebookFiles) {
      let content: string | undefined;
      let needsRemoteFetch = !metadata.hasLocalContent;

      if (includeContent && metadata.hasLocalContent) {
        const contentEntity = await this.storage.get<FileContentEntity>(
          DB_CONFIG.STORES.FILES_CONTENT,
          metadata.id
        );
        if (contentEntity) {
          content = contentEntity.content;
          needsRemoteFetch = false;
        } else {
          needsRemoteFetch = true;
        }
      }

      results.push({
        metadata,
        content,
        needsRemoteFetch,
      });
    }

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
    const metadata = await this.storage.get<FileMetadataEntity>(
      DB_CONFIG.STORES.FILES_METADATA,
      fileId
    );

    if (!metadata) return false;

    const updatedMetadata: FileMetadataEntity = {
      ...metadata,
      hasLocalContent: true,
      storageType: 'local',
      size: new Blob([content]).size,
      lastModified: new Date().toISOString(),
      lastAccessedAt: Date.now(),
    };

    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT],
      'readwrite',
      async (stores) => {
        stores[DB_CONFIG.STORES.FILES_METADATA].put(updatedMetadata);

        const contentEntity: FileContentEntity = {
          fileId,
          content,
          compressed: false,
          encoding: 'utf8',
        };
        stores[DB_CONFIG.STORES.FILES_CONTENT].put(contentEntity);
      }
    );

    return true;
  }

  private generateContentPreview(content: string): string {
    return content.substring(0, 500);
  }
}
