import type { Cell } from '@Store/models';
import {
  NotebookSourceSession,
  type NotebookSourceSessionCheckpoint,
} from './NotebookSourceSession';
import { SourceDraftHistory, type SourceDraftHistoryCheckpoint } from './SourceDraftHistory';

export interface NotebookSourceDraftCheckpoint {
  version: 1;
  session: NotebookSourceSessionCheckpoint;
  history: SourceDraftHistoryCheckpoint;
  viewport: { top: number; left: number };
}

export interface NotebookSourceDraft {
  readonly notebookId: string | null;
  readonly session: NotebookSourceSession;
  readonly history: SourceDraftHistory;
  readonly viewport: { top: number; left: number };
}

/** App-lifetime ownership of unapplied drafts; closing explicitly releases them. */
export class NotebookSourceDraftRegistry {
  private readonly drafts = new Map<string, NotebookSourceDraft>();
  private readonly subscriptions = new Map<NotebookSourceDraft, () => void>();
  private readonly dirtyDrafts = new Set<NotebookSourceDraft>();

  constructor(private readonly host?: Pick<Window, 'addEventListener' | 'removeEventListener'>) {}

  checkpoint(draft: NotebookSourceDraft): NotebookSourceDraftCheckpoint {
    if (draft.session.source !== draft.history.source)
      throw new Error('Source draft and history are out of sync');
    return {
      version: 1,
      session: draft.session.checkpoint(),
      history: draft.history.checkpoint(),
      viewport: { ...draft.viewport },
    };
  }

  restore(checkpoint: NotebookSourceDraftCheckpoint): NotebookSourceDraft {
    if (!checkpoint || checkpoint.version !== 1)
      throw new Error('Unsupported source draft checkpoint');
    if (
      !checkpoint.viewport ||
      !Number.isFinite(checkpoint.viewport.top) ||
      !Number.isFinite(checkpoint.viewport.left) ||
      checkpoint.viewport.top < 0 ||
      checkpoint.viewport.left < 0
    )
      throw new Error('Invalid source draft viewport');
    // Build and validate the complete candidate before registering any ownership
    // or unload protection. A failed restore must leave the current draft intact.
    const session = NotebookSourceSession.restore(checkpoint.session);
    const history = SourceDraftHistory.restore(checkpoint.history);
    if (session.source !== history.source)
      throw new Error('Source draft and history are out of sync');
    const notebookId = checkpoint.session.notebookId;
    const existing = notebookId ? this.drafts.get(notebookId) : undefined;
    if (existing && existing.session.state !== 'applied' && existing.session.state !== 'cancelled')
      throw new Error('An active source draft already exists for this notebook');
    const draft = { notebookId, session, history, viewport: { ...checkpoint.viewport } };
    if (existing) this.release(existing);
    this.attach(draft);
    return draft;
  }

  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (!this.dirtyDrafts.size) return;
    event.preventDefault();
    event.returnValue = '';
  };

  private setDirty(draft: NotebookSourceDraft, dirty: boolean) {
    const wasDirty = this.dirtyDrafts.size > 0;
    if (dirty) this.dirtyDrafts.add(draft);
    else this.dirtyDrafts.delete(draft);
    const isDirty = this.dirtyDrafts.size > 0;
    if (!wasDirty && isDirty) this.host?.addEventListener('beforeunload', this.beforeUnload);
    else if (wasDirty && !isDirty)
      this.host?.removeEventListener('beforeunload', this.beforeUnload);
  }

  private protect(draft: NotebookSourceDraft) {
    if (this.subscriptions.has(draft)) return;
    this.subscriptions.set(
      draft,
      draft.session.subscribeUnsavedChanges((dirty) => this.setDirty(draft, dirty))
    );
  }

  open(notebookId: string | null, cells: readonly Cell[]): NotebookSourceDraft {
    const existing = notebookId ? this.drafts.get(notebookId) : undefined;
    if (existing && existing.session.state !== 'applied' && existing.session.state !== 'cancelled')
      return existing;
    if (existing) this.release(existing);
    const session = new NotebookSourceSession(notebookId, cells);
    const draft = {
      notebookId,
      session,
      history: new SourceDraftHistory(session.source),
      viewport: { top: 0, left: 0 },
    };
    if (notebookId) this.drafts.set(notebookId, draft);
    this.protect(draft);
    return draft;
  }

  detach(draft: NotebookSourceDraft) {
    if (
      !draft.notebookId ||
      (!draft.session.hasEdits && !draft.history.canUndo && !draft.history.canRedo) ||
      draft.session.state === 'applied' ||
      draft.session.state === 'cancelled'
    )
      this.release(draft);
  }

  attach(draft: NotebookSourceDraft) {
    if (draft.session.state !== 'editing' && draft.session.state !== 'conflicted') return;
    if (draft.notebookId) {
      const owner = this.drafts.get(draft.notebookId);
      if (owner && owner !== draft) return;
      this.drafts.set(draft.notebookId, draft);
    }
    this.protect(draft);
  }

  release(draft: NotebookSourceDraft) {
    if (draft.notebookId && this.drafts.get(draft.notebookId) === draft)
      this.drafts.delete(draft.notebookId);
    this.subscriptions.get(draft)?.();
    this.subscriptions.delete(draft);
    this.setDirty(draft, false);
  }
}

export const notebookSourceDrafts = new NotebookSourceDraftRegistry(
  typeof window === 'undefined' ? undefined : window
);
