import type { FileMetadataEntity } from '@Storage/schema';
import type { FileObject } from '@Store/models';

/** Project a committed cache record into the preview model without changing storage. */
export function fileFromCache(record: {
  metadata: FileMetadataEntity;
  content?: string;
}): FileObject {
  const { metadata, content } = record;
  return {
    id: metadata.id,
    notebookId: metadata.notebookId,
    path: metadata.filePath,
    name: metadata.fileName,
    content: content ?? '',
    type: metadata.fileType,
    lastModified: metadata.lastModified,
    size: metadata.size,
    cachedAt: metadata.cachedAt,
    accessCount: metadata.accessCount,
    lastAccessed: metadata.lastAccessedAt,
  };
}
