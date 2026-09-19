import type { Cell } from '@Store/models';
import { NotebookSourceDocument } from './NotebookSourceDocument';

export type SourceSessionState = 'editing' | 'conflicted' | 'applying' | 'applied' | 'cancelled';

/** Owns a local draft; only a successful apply may publish document changes. */
export class NotebookSourceSession {
  private readonly document: NotebookSourceDocument;
  private draft: string;
  private phase: SourceSessionState = 'editing';
  private failure: string | null = null;

  constructor(
    private readonly notebookId: string | null,
    cells: readonly Cell[]
  ) {
    this.document = new NotebookSourceDocument(cells);
    this.draft = this.document.source;
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

  edit(source: string): void {
    this.assertOpen();
    this.draft = source;
    this.phase = 'editing';
    this.failure = null;
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
  }

  private assertOpen(): void {
    if (this.phase === 'applying') throw new Error('Source session is being applied');
    if (this.phase === 'applied' || this.phase === 'cancelled')
      throw new Error('Source session is closed');
  }
}
