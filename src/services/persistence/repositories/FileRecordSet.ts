import { FileRecordOwnership } from './FileRecordOwnership';
import { FileContentRecord } from './FileContentRecord';
import { makeFileId } from '../../../storage/fileIdentity';
import type { FileContentEntity, FileMetadataEntity } from '../../../storage/schema';
import { DEFAULT_STORAGE_CONFIG } from '../../../storage/schema';
import { getFileType } from '../../../storage/fileTypes';
import type { FileSaveData, FileSaveOptions } from '../interfaces';

/** One file's prepared records. The caller owns the transaction and its commit boundary. */
export class FileRecordSet {
  readonly metadata: FileMetadataEntity;
  readonly content: FileContentEntity | undefined;

  constructor(data: FileSaveData, options: FileSaveOptions = {}, previous?: FileMetadataEntity) {
    const maxFileSize = options.maxFileSize ?? DEFAULT_STORAGE_CONFIG.maxFileSize;
    if (
      !Number.isSafeInteger(maxFileSize) ||
      maxFileSize < 0 ||
      !Number.isSafeInteger(data.size) ||
      data.size < 0
    ) {
      throw new Error('Invalid file size or storage threshold');
    }
    const fileId = makeFileId(data.notebookId, data.filePath);
    const payload = new FileContentRecord({ fileId, content: data.content }, fileId).toRecord();
    const hasRemoteReference =
      typeof data.remoteUrl === 'string' && data.remoteUrl.trim().length > 0;
    const isRemote = data.size > maxFileSize && !options.forceLocal && hasRemoteReference;
    const now = Date.now();
    this.metadata = {
      ...previous,
      id: fileId,
      notebookId: data.notebookId,
      filePath: data.filePath,
      fileName: data.fileName,
      fileType: getFileType(data.filePath),
      size: data.size,
      lastModified: data.lastModified,
      cachedAt: previous?.cachedAt ?? now,
      lastAccessedAt: now,
      accessCount: previous?.accessCount ?? 1,
      storageType: isRemote ? 'remote' : 'local',
      hasLocalContent: !isRemote,
      remoteUrl: data.remoteUrl,
      isLargeFile: isRemote,
      contentPreview: isRemote ? payload.content.substring(0, 500) : undefined,
    };
    new FileRecordOwnership(data.notebookId, data.filePath).verify(this.metadata);
    this.content = isRemote
      ? undefined
      : {
          ...payload,
          compressed: false,
          encoding: 'utf8',
        };
  }

  static localUpdate(metadata: FileMetadataEntity, content: string): FileRecordSet {
    return new FileRecordSet(
      {
        notebookId: metadata.notebookId,
        filePath: metadata.filePath,
        fileName: metadata.fileName,
        remoteUrl: metadata.remoteUrl,
        content,
        size: new Blob([content]).size,
        lastModified: new Date().toISOString(),
      },
      { forceLocal: true },
      metadata
    );
  }

  writeTo(metadata: IDBObjectStore, content: IDBObjectStore): void {
    metadata.put(this.metadata);
    if (this.content) content.put(this.content);
    else content.delete(this.metadata.id);
  }
}
