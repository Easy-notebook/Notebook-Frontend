import { makeFileId } from '../../../storage/fileIdentity';
import type { SplitFileEntity } from '../../../storage/schema';

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/** Validated snapshot shared by split-file reads, writes and transactional edits. */
export class SplitFileRecord {
  private readonly record: SplitFileEntity;

  constructor(value: unknown, expectedId?: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid split file record');
    const data = value as Record<string, unknown>;
    if (
      !nonEmptyString(data.notebookId) ||
      !nonEmptyString(data.filePath) ||
      !nonEmptyString(data.fileName) ||
      typeof data.content !== 'string' ||
      !nonEmptyString(data.type) ||
      !nonEmptyString(data.lastModified)
    )
      throw new Error(
        'Invalid split file: identity, name, content, type and modification time are required'
      );
    if (
      !nonEmptyString(data.id) ||
      data.id !== makeFileId(data.notebookId, data.filePath) ||
      (expectedId !== undefined && data.id !== expectedId)
    )
      throw new Error('Invalid split file identity');
    if (typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || data.size < 0)
      throw new Error('Invalid split file size');
    if (
      typeof data.cachedAt !== 'number' ||
      !Number.isSafeInteger(data.cachedAt) ||
      data.cachedAt < 0
    )
      throw new Error('Invalid split file cache timestamp');
    this.record = {
      id: data.id,
      notebookId: data.notebookId,
      filePath: data.filePath,
      fileName: data.fileName,
      content: data.content,
      type: data.type,
      size: data.size,
      lastModified: data.lastModified,
      cachedAt: data.cachedAt,
      metadata: structuredClone(data.metadata),
    };
  }

  toRecord(): SplitFileEntity {
    return structuredClone(this.record);
  }
}
