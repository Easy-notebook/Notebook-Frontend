import type { FileContentEntity, FileMetadataEntity } from '../../../storage/schema';
import { DEFAULT_STORAGE_CONFIG } from '../../../storage/schema';
import { getFileType } from '../../../storage/fileTypes';
import type { FileSaveData, FileSaveOptions } from '../interfaces';

/** One file's prepared records. The caller owns the transaction and its commit boundary. */
export class FileRecordSet {
  readonly metadata: FileMetadataEntity;
  readonly content: FileContentEntity | undefined;

  constructor(data: FileSaveData, options: FileSaveOptions = {}) {
    const maxFileSize = options.maxFileSize ?? DEFAULT_STORAGE_CONFIG.maxFileSize;
    if (
      !Number.isSafeInteger(maxFileSize) ||
      maxFileSize < 0 ||
      !Number.isSafeInteger(data.size) ||
      data.size < 0
    ) {
      throw new Error('Invalid file size or storage threshold');
    }
    const fileId = `${data.notebookId}::${data.filePath}`;
    const hasRemoteReference =
      typeof data.remoteUrl === 'string' && data.remoteUrl.trim().length > 0;
    const isRemote = data.size > maxFileSize && !options.forceLocal && hasRemoteReference;
    const now = Date.now();
    this.metadata = {
      id: fileId,
      notebookId: data.notebookId,
      filePath: data.filePath,
      fileName: data.fileName,
      fileType: getFileType(data.filePath),
      size: data.size,
      lastModified: data.lastModified,
      cachedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      storageType: isRemote ? 'remote' : 'local',
      hasLocalContent: !isRemote,
      remoteUrl: data.remoteUrl,
      isLargeFile: isRemote,
      contentPreview: isRemote ? data.content.substring(0, 500) : undefined,
    };
    this.content = isRemote
      ? undefined
      : {
          fileId,
          content: data.content,
          compressed: false,
          encoding: 'utf8',
        };
  }

  writeTo(metadata: IDBObjectStore, content: IDBObjectStore): void {
    metadata.put(this.metadata);
    if (this.content) content.put(this.content);
    else content.delete(this.metadata.id);
  }
}
