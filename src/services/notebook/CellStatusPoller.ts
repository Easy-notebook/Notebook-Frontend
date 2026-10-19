import type { ExecutionStatus } from '@Services/types';
import type { CellExecutionState } from '@Store/models';
interface PollingPorts {
  notebookId(): string | null;
  hasCell(id: string): boolean;
  executing(id: string): boolean;
  watch(check: () => void): () => void;
  status(notebookId: string, signal: AbortSignal): Promise<ExecutionStatus>;
  update(id: string, state: Partial<CellExecutionState>): void;
  outputs(id: string, outputs: NonNullable<ExecutionStatus['outputs']>): void;
  error(id: string, error: unknown): void;
}
interface PollingSession {
  notebookId: string;
  interval: number;
  inFlight: boolean;
  controller: AbortController;
  unsubscribe(): void;
}

/** A cell polling session owns one timer and at most one in-flight request. */
export class CellStatusPoller {
  private resetting = false;
  private readonly sessions = new Map<string, PollingSession>();
  constructor(private readonly ports: PollingPorts) {}
  start(cellId: string): void {
    if (this.resetting) return;
    this.stop(cellId);
    if (this.sessions.has(cellId)) return;
    const notebookId = this.ports.notebookId();
    if (!notebookId || !this.ports.hasCell(cellId) || !this.ports.executing(cellId)) return;
    const session: PollingSession = {
      notebookId,
      interval: 0,
      inFlight: false,
      controller: new AbortController(),
      unsubscribe: () => {},
    };
    this.sessions.set(cellId, session);
    session.unsubscribe = this.ports.watch(() => {
      if (this.sessions.get(cellId) === session && !this.validOwner(cellId, session))
        this.retire(cellId, session);
    });
    session.interval = window.setInterval(() => {
      void this.poll(cellId, session);
    }, 1000);
    this.ports.update(cellId, { statusCheckInterval: session.interval });
  }
  stop(cellId: string): void {
    const session = this.sessions.get(cellId);
    if (!session) return;
    this.retire(cellId, session);
    if (!this.sessions.has(cellId) && this.validOwner(cellId, session))
      this.ports.update(cellId, { statusCheckInterval: null });
  }
  reset(): void {
    this.resetting = true;
    try {
      for (const [cellId, session] of [...this.sessions]) this.retire(cellId, session);
    } finally {
      this.resetting = false;
    }
  }
  private validOwner(cellId: string, session: PollingSession): boolean {
    return this.ports.notebookId() === session.notebookId && this.ports.hasCell(cellId);
  }
  private current(cellId: string, session: PollingSession): boolean {
    return (
      this.sessions.get(cellId) === session &&
      !session.controller.signal.aborted &&
      this.validOwner(cellId, session)
    );
  }
  private retire(cellId: string, session: PollingSession): void {
    if (this.sessions.get(cellId) !== session) return;
    this.sessions.delete(cellId);
    window.clearInterval(session.interval);
    session.unsubscribe();
    session.controller.abort();
  }
  private complete(cellId: string, session: PollingSession): void {
    this.retire(cellId, session);
    if (!this.sessions.has(cellId) && this.validOwner(cellId, session))
      this.ports.update(cellId, { isExecuting: false, elapsedTime: 0, statusCheckInterval: null });
  }
  private async poll(cellId: string, session: PollingSession): Promise<void> {
    if (!this.current(cellId, session)) {
      this.retire(cellId, session);
      return;
    }
    if (!this.ports.executing(cellId)) {
      this.stop(cellId);
      return;
    }
    if (session.inFlight) return;
    session.inFlight = true;
    try {
      const status = await this.ports.status(session.notebookId, session.controller.signal);
      if (!this.current(cellId, session)) return;
      if (!this.ports.executing(cellId)) {
        this.stop(cellId);
        return;
      }
      if (status.outputs?.length) this.ports.outputs(cellId, status.outputs);
      if (!this.current(cellId, session)) return;
      if (status.status === 'running')
        this.ports.update(cellId, { elapsedTime: status.elapsed_time || 0 });
      else this.complete(cellId, session);
    } catch (error) {
      if (this.current(cellId, session)) {
        this.ports.error(cellId, error);
        if (this.current(cellId, session)) this.complete(cellId, session);
      }
    } finally {
      session.inFlight = false;
    }
  }
}
