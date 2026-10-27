import type {
  INotebookRecoveryRepository,
  NotebookRecoveryRecord,
  NotebookEntity,
} from '../persistence/interfaces';

interface RecoveryState {
  phase: 'idle' | 'loading' | 'ready' | 'deleting' | 'restoring' | 'failed';
  drafts: readonly NotebookRecoveryRecord[];
  error: string | null;
  notice: string | null;
  pendingDeletion: Readonly<NotebookRecoveryRecord> | null;
  restored: Pick<NotebookEntity, 'id' | 'name'> | null;
}

/** Coordinates recovery reads and revision-checked restore/delete actions for any view. */
export class NotebookRecoveryController {
  private state: RecoveryState = {
    phase: 'idle',
    pendingDeletion: null,
    drafts: [],
    error: null,
    notice: null,
    restored: null,
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private refreshVersion = 0;

  constructor(private readonly repository: INotebookRecoveryRepository) {}

  getSnapshot = (): RecoveryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async refresh(): Promise<void> {
    ++this.refreshVersion;
    if (this.busy) return;
    const generation = ++this.generation;
    this.publish({ ...this.state, phase: 'loading', error: null });
    try {
      const drafts = await this.repository.listDrafts();
      if (generation === this.generation) this.publish({ ...this.state, phase: 'ready', drafts });
    } catch (error) {
      if (generation === this.generation)
        this.publish({ ...this.state, phase: 'failed', error: this.message(error) });
    }
  }

  requestDeletion(draft: NotebookRecoveryRecord): void {
    if (this.busy || this.state.pendingDeletion) return;
    this.publish({ ...this.state, pendingDeletion: draft });
  }

  cancelDeletion(): void {
    if (this.busy) return;
    this.publish({ ...this.state, pendingDeletion: null });
  }

  async confirmDeletion(): Promise<void> {
    const draft = this.state.pendingDeletion;
    if (!draft || this.busy) return;
    await this.discard(draft);
  }

  async discard(draft: Pick<NotebookRecoveryRecord, 'id' | 'revision'>): Promise<void> {
    const { id, revision } = draft;
    return this.mutate('deleting', async () => {
      const deleted = await this.repository.discardDraft(id, revision);
      return {
        restored: null,
        notice: deleted
          ? 'Recovery copy deleted. Your current notebook was not changed.'
          : 'This recovery copy changed or was already removed. Review the refreshed list.',
      };
    });
  }

  async restore(draft: Pick<NotebookRecoveryRecord, 'id' | 'revision'>): Promise<void> {
    const { id, revision } = draft;
    return this.mutate('restoring', async () => {
      const restored = await this.repository.restoreDraft(id, revision);
      return {
        restored,
        notice: restored
          ? 'A new notebook was created. Open it in a new tab to continue editing.'
          : 'This recovery copy changed or was already removed. Review the refreshed list.',
      };
    });
  }

  private get busy(): boolean {
    return this.state.phase === 'deleting' || this.state.phase === 'restoring';
  }

  private async mutate(
    phase: 'deleting' | 'restoring',
    operation: () => Promise<Pick<RecoveryState, 'notice' | 'restored'>>
  ): Promise<void> {
    if (this.busy) return;
    const generation = ++this.generation;
    this.publish({ ...this.state, phase, error: null, notice: null });
    try {
      const result = await operation();
      if (generation !== this.generation) return;
      // A committed copy must remain accessible even if refreshing the list fails.
      this.publish({ ...this.state, ...result, restored: result.restored ?? this.state.restored });
      await this.refreshAfterMutation(generation);
    } catch (error) {
      if (generation === this.generation)
        this.publish({
          ...this.state,
          phase: 'failed',
          pendingDeletion: null,
          error: this.message(error),
        });
    }
  }

  private async refreshAfterMutation(generation: number): Promise<void> {
    // Refresh events may arrive after a list transaction captured its snapshot.
    // Keep mutation admission closed until a read covers every received event.
    for (;;) {
      const version = this.refreshVersion;
      try {
        const drafts = await this.repository.listDrafts();
        if (version === this.refreshVersion) {
          if (generation === this.generation)
            this.publish({ ...this.state, phase: 'ready', pendingDeletion: null, drafts });
          return;
        }
      } catch (error) {
        if (version === this.refreshVersion) throw error;
      }
    }
  }

  private publish(state: RecoveryState): void {
    this.state = Object.freeze({
      ...state,
      pendingDeletion: state.pendingDeletion ? Object.freeze({ ...state.pendingDeletion }) : null,
      restored: state.restored ? Object.freeze({ ...state.restored }) : null,
      drafts: Object.freeze(state.drafts.map((draft) => Object.freeze({ ...draft }))),
    });
    for (const listener of this.listeners) listener();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
