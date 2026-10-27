import type { Cell } from '@Store/models';
import {
  NotebookSourceDocument,
  type NotebookSourceDocumentCheckpoint,
} from './NotebookSourceDocument';

export interface NotebookSourceSessionCheckpoint {
  version: 1;
  notebookId: string | null;
  document: NotebookSourceDocumentCheckpoint;
  source: string;
}

export type SourceSessionState = 'editing' | 'conflicted' | 'applying' | 'applied' | 'cancelled';

/** Owns a local draft; only a successful apply may publish document changes. */
export class NotebookSourceSession {
  private readonly document: NotebookSourceDocument;
  private draft: string;
  private phase: SourceSessionState = 'editing';
  private failure: string | null = null;
  private unsaved = false;
  private readonly unsavedListeners = new Set<(unsaved: boolean) => void>();

  constructor(
    private readonly notebookId: string | null,
    cells: readonly Cell[] | NotebookSourceDocument
  ) {
    this.document =
      cells instanceof NotebookSourceDocument ? cells : new NotebookSourceDocument(cells);
    this.draft = this.document.source;
  }

  checkpoint(): NotebookSourceSessionCheckpoint {
    this.assertOpen();
    return {
      version: 1,
      notebookId: this.notebookId,
      document: this.document.checkpoint(),
      source: this.draft,
    };
  }

  static restore(checkpoint: NotebookSourceSessionCheckpoint): NotebookSourceSession {
    if (!checkpoint || checkpoint.version !== 1)
      throw new Error('Unsupported source session checkpoint');
    if (
      typeof checkpoint.source !== 'string' ||
      (checkpoint.notebookId !== null && typeof checkpoint.notebookId !== 'string')
    )
      throw new Error('Invalid source session checkpoint');
    const session = new NotebookSourceSession(
      checkpoint.notebookId,
      NotebookSourceDocument.restore(checkpoint.document)
    );
    // Broken boundaries are editable drafts too. Validate only when applying, and
    // re-evaluate conflicts against live state instead of restoring a stale error.
    session.edit(checkpoint.source);
    return session;
  }

  get source() {
    return this.draft;
  }
  get hasEdits() {
    return this.draft !== this.document.source;
  }
  get state() {
    return this.phase;
  }
  get error() {
    return this.failure;
  }

  subscribeUnsavedChanges(listener: (unsaved: boolean) => void): () => void {
    this.unsavedListeners.add(listener);
    listener(this.unsaved);
    return () => {
      this.unsavedListeners.delete(listener);
    };
  }

  private updateUnsavedChanges(): void {
    const unsaved = this.phase !== 'applied' && this.phase !== 'cancelled' && this.hasEdits;
    if (unsaved === this.unsaved) return;
    this.unsaved = unsaved;
    for (const listener of this.unsavedListeners) listener(unsaved);
  }

  edit(source: string): void {
    this.assertOpen();
    this.draft = source;
    this.phase = 'editing';
    this.failure = null;
    this.updateUnsavedChanges();
  }

  appendCell(type: 'markdown' | 'code' | 'raw'): number {
    this.assertOpen();
    const insertion = this.document.appendCell(this.draft, type);
    this.edit(insertion.source);
    return insertion.cursor;
  }

  apply(
    notebookId: string | null,
    current: readonly Cell[],
    publish: (cells: Cell[]) => void
  ): boolean {
    this.assertOpen();
    try {
      if (notebookId !== this.notebookId)
        throw new Error('The active notebook changed; this draft was not applied');
      const next = this.document.reconcile(this.draft, current);
      this.phase = 'applying';
      if (next.length !== current.length || next.some((cell, index) => cell !== current[index]))
        publish(next);
      this.phase = 'applied';
      this.failure = null;
      this.updateUnsavedChanges();
      return true;
    } catch (error) {
      this.phase = 'conflicted';
      this.failure = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  cancel(): void {
    this.assertOpen();
    this.phase = 'cancelled';
    this.failure = null;
    this.updateUnsavedChanges();
  }

  private assertOpen(): void {
    if (this.phase === 'applying') throw new Error('Source session is being applied');
    if (this.phase === 'applied' || this.phase === 'cancelled')
      throw new Error('Source session is closed');
  }
}
