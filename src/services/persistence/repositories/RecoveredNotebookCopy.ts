import type { NotebookEntity, NotebookRecoveryRecord } from '../interfaces';
import { FileRecordSet } from './FileRecordSet';

/** Builds a new document identity while preserving the recovered notebook's payload. */
export class RecoveredNotebookCopy {
  readonly notebook: NotebookEntity;
  readonly file: FileRecordSet;

  constructor(draft: NotebookRecoveryRecord, id: string, now = Date.now()) {
    if (!id.trim() || id === draft.notebookId)
      throw new Error('Recovery requires a new notebook identity');
    const parsed: unknown = JSON.parse(draft.content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid recovery notebook');
    const data = parsed as Record<string, unknown>;
    if (
      data.notebook_id !== draft.notebookId ||
      !Array.isArray(data.cells) ||
      (data.tasks !== undefined && !Array.isArray(data.tasks))
    )
      throw new Error('Invalid recovery notebook identity or structure');
    if (
      data.cells.some(
        (cell) =>
          !cell ||
          typeof cell !== 'object' ||
          typeof cell.id !== 'string' ||
          typeof cell.type !== 'string' ||
          typeof cell.content !== 'string'
      )
    )
      throw new Error('Invalid recovered cell');
    if (
      data.metadata !== undefined &&
      (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata))
    )
      throw new Error('Invalid recovery metadata');
    const originalTitle =
      typeof data.title === 'string' && data.title.trim()
        ? data.title
        : typeof data.notebookTitle === 'string' && data.notebookTitle.trim()
          ? data.notebookTitle
          : 'Untitled';
    const name = `${originalTitle} (Recovered)`;
    const content = JSON.stringify({
      ...data,
      notebook_id: id,
      title: name,
      notebookTitle: name,
      saved_at: now,
      metadata: {
        ...(data.metadata as Record<string, unknown> | undefined),
        totalCells: data.cells.length,
        lastSaved: new Date(now).toISOString(),
      },
    });
    this.file = new FileRecordSet(
      {
        notebookId: id,
        filePath: `notebook_${id}.json`,
        fileName: `${name}.easynb`,
        content,
        size: new Blob([content]).size,
        lastModified: new Date(now).toISOString(),
      },
      { forceLocal: true }
    );
    this.notebook = {
      id,
      name,
      description: 'Recovered from a local conflict copy',
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      fileCount: 1,
      totalSize: this.file.metadata.size,
      cacheEnabled: true,
      retention: 'persistent',
    };
  }
}
