import type { FileMetadata } from '@Store/models/preview';

/** Invocation-time metadata; content and byte counts come from the selected resource. */
export class PreviewFileMetadata {
  readonly fileName: string;
  readonly lastModified: string | number | null;

  constructor(filePath: string, metadata: FileMetadata = {}) {
    this.fileName = metadata.file?.name ?? (filePath.split('/').pop() || filePath);
    this.lastModified = metadata.lastModified || null;
  }
}
