import type { FileSaveData, NotebookSaveData } from '../persistence/interfaces';
import type { NotebookSnapshot } from './types';

/** One serialized document shared by canonical persistence and conflict recovery. */
export class NotebookSnapshotDocument {
  readonly content: string;
  readonly notebook: NotebookSaveData;
  readonly file: FileSaveData;

  constructor(snapshot: NotebookSnapshot) {
    const { notebookId, notebookTitle, cells, tasks, timestamp } = snapshot;
    this.content = JSON.stringify({
      notebook_id: notebookId,
      title: notebookTitle,
      notebookTitle,
      cells: cells || [],
      tasks: tasks || [],
      saved_at: timestamp,
      version: '2.0',
      metadata: {
        totalCells: cells?.length || 0,
        hasImages: cells?.some((cell) => cell.type === 'image') || false,
        lastSaved: new Date(timestamp).toISOString(),
      },
    });
    this.notebook = {
      id: notebookId,
      name: notebookTitle || `Notebook ${notebookId.slice(0, 8)}`,
      description: '',
      lastAccessedAt: timestamp,
      accessCount: 1,
      cacheEnabled: true,
    };
    this.file = {
      notebookId,
      filePath: `notebook_${notebookId}.json`,
      fileName: `${notebookTitle || 'Untitled'}.easynb`,
      content: this.content,
      lastModified: new Date(timestamp).toISOString(),
      size: new Blob([this.content]).size,
      remoteUrl: undefined,
    };
  }
}
