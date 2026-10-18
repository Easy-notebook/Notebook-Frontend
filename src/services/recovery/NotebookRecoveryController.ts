import type {
  INotebookRecoveryRepository,
  NotebookRecoveryRecord,
} from '../persistence/interfaces';

interface RecoveryState {
  phase: 'idle' | 'loading' | 'ready' | 'deleting' | 'failed';
  drafts: readonly NotebookRecoveryRecord[];
  error: string | null;
  notice: string | null;
}

/** Coordinates recovery reads and revision-checked deletion for any view. */
export class NotebookRecoveryController {
  private state: RecoveryState = { phase: 'idle', drafts: [], error: null, notice: null };
  private readonly listeners = new Set<() => void>();
  private generation = 0;

  constructor(private readonly repository: INotebookRecoveryRepository) {}

  getSnapshot = (): RecoveryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async refresh(): Promise<void> {
    if (this.state.phase === 'deleting') return;
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

  async discard(draft: Pick<NotebookRecoveryRecord, 'id' | 'revision'>): Promise<void> {
    if (this.state.phase === 'deleting') return;
    const { id, revision } = draft;
    const generation = ++this.generation;
    this.publish({ ...this.state, phase: 'deleting', error: null, notice: null });
    try {
      const deleted = await this.repository.discardDraft(id, revision);
      const drafts = await this.repository.listDrafts();
      if (generation !== this.generation) return;
      this.publish({
        phase: 'ready',
        drafts,
        error: null,
        notice: deleted
          ? 'Recovery copy deleted. Your current notebook was not changed.'
          : 'This recovery copy changed or was already removed. Review the refreshed list.',
      });
    } catch (error) {
      if (generation === this.generation)
        this.publish({ ...this.state, phase: 'failed', error: this.message(error) });
    }
  }

  private publish(state: RecoveryState): void {
    this.state = Object.freeze({
      ...state,
      drafts: Object.freeze(state.drafts.map((draft) => Object.freeze({ ...draft }))),
    });
    for (const listener of this.listeners) listener();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
