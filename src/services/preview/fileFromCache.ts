import type { IFileRepository } from '@Services/persistence/interfaces';
import type { FileObject } from '@Store/models';

export type CachedFileRecord = NonNullable<Awaited<ReturnType<IFileRepository['getFile']>>>;
type LocalFileRecord = CachedFileRecord & { content: string };

/** Metadata or preview snippets alone do not constitute a displayable cache hit. */
export function hasCachedContent(
  record: CachedFileRecord | null | undefined
): record is LocalFileRecord {
  return !!record && !record.needsRemoteFetch && typeof record.content === 'string';
}

/** Project a complete committed cache record into the preview model. */
export function fileFromCache({ metadata, content }: LocalFileRecord): FileObject {
  return {
    id: metadata.id,
    notebookId: metadata.notebookId,
    path: metadata.filePath,
    name: metadata.fileName,
    content,
    type: metadata.fileType,
    lastModified: metadata.lastModified,
    size: metadata.size,
    cachedAt: metadata.cachedAt,
    accessCount: metadata.accessCount,
    lastAccessed: metadata.lastAccessedAt,
  };
}
