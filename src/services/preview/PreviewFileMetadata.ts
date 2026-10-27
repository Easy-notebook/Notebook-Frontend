import type { FileMetadata } from '@Store/models/preview';

/** Invocation-time metadata; content and byte counts come from the selected resource. */
export class PreviewFileMetadata {
  readonly fileName: string;
  readonly lastModified: string | null;

  constructor(filePath: string, metadata: FileMetadata = {}) {
    this.fileName = metadata.file?.name ?? (filePath.split('/').pop() || filePath);
    const marker = metadata.lastModified;
    if (marker === undefined || marker === '') this.lastModified = null;
    else if (typeof marker === 'string') this.lastModified = marker;
    else if (typeof marker === 'number' && Number.isFinite(marker))
      this.lastModified = String(marker);
    else throw new TypeError('File modification marker must be a string or finite number');
  }

  matchesCachedVersion(marker: string): boolean {
    return this.lastModified === null || this.lastModified === marker;
  }

  modificationMarkerForSave(): string {
    return this.lastModified ?? new Date().toISOString();
  }
}
