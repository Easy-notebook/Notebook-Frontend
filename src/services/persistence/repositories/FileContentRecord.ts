import type { FileContentEntity } from '../../../storage/schema';

type ContentPayload = Pick<FileContentEntity, 'fileId' | 'content'>;

/** The consumed payload contract, independent of historical encoding annotations. */
export class FileContentRecord {
  private readonly record: ContentPayload;

  constructor(value: unknown, expectedFileId: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid file content record');
    const data = value as Record<string, unknown>;
    if (typeof data.fileId !== 'string' || !data.fileId || data.fileId !== expectedFileId)
      throw new Error('Invalid file content identity');
    if (typeof data.content !== 'string') throw new Error('Invalid file content payload');
    this.record = { fileId: data.fileId, content: data.content };
  }

  static expectsLocalContent(metadata: { hasLocalContent: unknown }): boolean {
    if (typeof metadata.hasLocalContent !== 'boolean')
      throw new Error('Invalid file content availability');
    return metadata.hasLocalContent;
  }

  toRecord(): ContentPayload {
    return { ...this.record };
  }
}
