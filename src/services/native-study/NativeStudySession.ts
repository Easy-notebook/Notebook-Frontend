import { NativeOperationObserver, type CommandProgress } from './NativeOperationObserver';
import { NativeStudyClient } from './NativeStudyClient';
import {
  pendingCommand,
  type NativeView,
  type PendingCommand,
  type StudyAbility,
} from './contracts';

type Status = 'disconnected' | 'loading' | 'ready' | 'running' | 'recoverable';
export interface StudySnapshot {
  status: Status;
  view: NativeView | null;
  error: string | null;
  pending: boolean;
  progress: CommandProgress | null;
}
/** One notebook's request lifecycle. Durable retry uses the exact accepted request, never a new ID. */
export class NativeStudySession {
  private snapshot: StudySnapshot = {
    status: 'disconnected',
    view: null,
    error: null,
    pending: false,
    progress: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly controller = new AbortController();
  private pending: PendingCommand | null = null;
  private observer: NativeOperationObserver | null = null;
  private readonly key: string;
  constructor(
    private readonly client: NativeStudyClient,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = sessionStorage
  ) {
    this.key = `aal-study-pending:${client.notebookId}`;
    const raw = storage.getItem(this.key);
    if (raw) {
      this.pending = pendingCommand.parse(JSON.parse(raw));
      this.snapshot = { ...this.snapshot, status: 'recoverable', pending: true };
    }
  }
  getSnapshot = (): StudySnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(value: Partial<StudySnapshot>) {
    if (this.controller.signal.aborted) return;
    this.snapshot = { ...this.snapshot, ...value, pending: this.pending !== null };
    this.listeners.forEach((listener) => listener());
  }
  private failed(error: unknown) {
    this.publish({
      status: this.pending ? 'recoverable' : 'disconnected',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  private observePending() {
    this.observer?.dispose();
    this.observer = this.pending
      ? new NativeOperationObserver(this.client, this.pending, (progress) =>
          this.publish({ progress })
        )
      : null;
  }
  async refresh(): Promise<void> {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'loading') return;
    if (this.controller.signal.aborted) return;
    if (this.pending) this.observePending();
    this.publish({ status: 'loading', error: null });
    try {
      const view = await this.client.state(this.controller.signal);
      this.publish({ view, status: this.pending ? 'recoverable' : 'ready' });
    } catch (error) {
      this.failed(error);
    }
  }
  async execute(ability: StudyAbility, args: Record<string, unknown>): Promise<void> {
    if (
      this.snapshot.status !== 'ready' ||
      !this.snapshot.view ||
      this.pending ||
      this.controller.signal.aborted
    )
      return;
    const document = this.snapshot.view.document;
    const command = pendingCommand.parse(
      JSON.parse(
        JSON.stringify({
          workspace: document.id,
          ability,
          arguments: { ...args, expected_revision: document.revision },
          invocation: crypto.randomUUID(),
        })
      )
    );
    // Persist before dispatch: quota errors cannot produce untracked side effects.
    try {
      this.storage.setItem(this.key, JSON.stringify(command));
    } catch (error) {
      this.failed(error);
      return;
    }
    this.pending = command;
    await this.submit(false);
  }
  async retry(): Promise<void> {
    await this.submit(true);
  }
  private async submit(lookup: boolean): Promise<void> {
    if (
      !this.pending ||
      this.snapshot.status === 'running' ||
      this.snapshot.status === 'loading' ||
      this.controller.signal.aborted
    )
      return;
    this.observePending();
    this.publish({ status: 'running', error: null });
    try {
      const completed =
        lookup && (await this.client.completed(this.pending, this.controller.signal));
      this.controller.signal.throwIfAborted();
      if (!completed) await this.client.command(this.pending, this.controller.signal);
      const view = await this.client.state(this.controller.signal);
      if (view.document.id !== this.pending.workspace)
        throw new Error('Native workspace changed; reload before editing');
      this.controller.signal.throwIfAborted();
      this.storage.removeItem(this.key);
      this.pending = null;
      this.observer?.dispose();
      this.observer = null;
      this.publish({ view, status: 'ready', progress: null });
    } catch (error) {
      this.failed(error);
    }
  }
  async discardRetry(): Promise<void> {
    if (this.snapshot.status === 'running' || this.controller.signal.aborted) return;
    this.storage.removeItem(this.key);
    this.pending = null;
    this.observer?.dispose();
    this.observer = null;
    this.publish({ status: 'disconnected', error: null, progress: null });
    await this.refresh();
  }
  dispose() {
    this.observer?.dispose();
    this.observer = null;
    this.controller.abort();
    this.listeners.clear();
  }
}
