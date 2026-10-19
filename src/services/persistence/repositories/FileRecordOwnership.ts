import { makeFileId } from '../../../storage/fileIdentity';
import type { FileMetadataEntity } from '../../../storage/schema';

/** Ownership constraint applied before using a stored record's identity or accounting. */
export class FileRecordOwnership {
  constructor(
    private readonly notebookId?: string,
    private readonly filePath?: string
  ) {}

  verify(record: FileMetadataEntity): void {
    if (
      !record ||
      typeof record !== 'object' ||
      Array.isArray(record) ||
      typeof record.notebookId !== 'string' ||
      !record.notebookId ||
      typeof record.filePath !== 'string' ||
      !record.filePath ||
      record.id !== makeFileId(record.notebookId, record.filePath) ||
      (this.notebookId !== undefined && record.notebookId !== this.notebookId) ||
      (this.filePath !== undefined && record.filePath !== this.filePath)
    )
      throw new Error('Invalid file metadata ownership');
  }
}
