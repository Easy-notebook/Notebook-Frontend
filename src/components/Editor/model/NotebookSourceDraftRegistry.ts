import type { Cell } from '@Store/models';
import { NotebookSourceSession } from './NotebookSourceSession';
import { SourceDraftHistory } from './SourceDraftHistory';

export interface NotebookSourceDraft {
  readonly notebookId: string | null;
  readonly session: NotebookSourceSession;
  readonly history: SourceDraftHistory;
}

/** App-lifetime ownership of unapplied drafts; closing explicitly releases them. */
export class NotebookSourceDraftRegistry {
  private readonly drafts = new Map<string, NotebookSourceDraft>();

  open(notebookId: string | null, cells: readonly Cell[]): NotebookSourceDraft {
    const existing = notebookId ? this.drafts.get(notebookId) : undefined;
    if (
      existing &&
      existing.session.state !== 'applied' && existing.session.state !== 'cancelled'
    )
      return existing;
    const session = new NotebookSourceSession(notebookId, cells);
    const draft = { notebookId, session, history: new SourceDraftHistory(session.source) };
    if (notebookId) this.drafts.set(notebookId, draft);
    return draft;
  }

  detach(draft: NotebookSourceDraft) {
    if (
      !draft.session.hasEdits ||
      draft.session.state === 'applied' ||
      draft.session.state === 'cancelled'
    )
      this.release(draft);
  }

  attach(draft: NotebookSourceDraft) {
    if (!draft.notebookId || this.drafts.has(draft.notebookId)) return;
    if (draft.session.state !== 'editing' && draft.session.state !== 'conflicted') return;
    this.drafts.set(draft.notebookId, draft);
  }

  release(draft: NotebookSourceDraft) {
    if (draft.notebookId && this.drafts.get(draft.notebookId) === draft)
      this.drafts.delete(draft.notebookId);
  }
}

export const notebookSourceDrafts = new NotebookSourceDraftRegistry();
