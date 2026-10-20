import { NotebookSaveQueue, type QueuedSnapshot } from './NotebookSaveQueue';

interface DrainRequest {
  completion: Promise<void>;
  notebookId?: string;
  blocked: Set<string>;
  failures: unknown[];
  resolve: () => void;
  reject: (error: unknown) => void;
}
interface Retry {
  revision: number;
  failures: number;
  readyAt: number;
}
/** A failed canonical write can retain edits before its failure becomes terminal. */
export interface NotebookSaveRecovery {
  readonly error: unknown;
  retain(snapshot: QueuedSnapshot): Promise<void>;
}

interface SchedulerOptions {
  maxRetries: number;
  retryDelayMs: number;
  retryable?: (error: unknown) => boolean;
  canRun: () => boolean;
  write: (snapshot: QueuedSnapshot) => Promise<void | NotebookSaveRecovery>;
  committed: (snapshot: QueuedSnapshot) => void;
  failed: (snapshot: QueuedSnapshot, error: unknown) => void;
}

/** One writer shared by scoped drains. Backoff belongs to a revision, not the writer. */
export class NotebookSaveScheduler {
  private readonly requests = new Set<DrainRequest>();
  private readonly retries = new Map<string, Retry>();
  private readonly served = new Map<string, number>();
  private turn = 0;
  private worker: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  constructor(
    private readonly queue: NotebookSaveQueue,
    private readonly options: SchedulerOptions
  ) {}

  drain(notebookId?: string, retryBlocked = true): Promise<void> {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const completion = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    this.requests.add({
      completion,
      notebookId,
      blocked: new Set(
        retryBlocked
          ? []
          : [...this.queue.keys()].filter((id) => this.queue.progress(id)?.phase === 'blocked')
      ),
      failures: [],
      resolve,
      reject,
    });
    this.changed();
    if (!this.worker) {
      // Install ownership before invoking callbacks, which may request another drain.
      this.worker = Promise.resolve().then(() => this.run());
    }
    return completion;
  }

  /** Wake retry waits after admission, discard, or a lifecycle transition. */
  changed(): void {
    this.wake?.();
  }

  /** Observe active requests without admitting unrelated pending notebooks. */
  async waitForComplete(): Promise<void> {
    await Promise.all([...this.requests].map((request) => request.completion));
  }

  async waitForIdle(): Promise<void> {
    while (this.worker) await this.worker;
  }

  private includes(request: DrainRequest, id: string): boolean {
    return (!request.notebookId || request.notebookId === id) && !request.blocked.has(id);
  }

  private pendingIds(): string[] {
    return [...this.queue.keys()].filter((id) =>
      [...this.requests].some((request) => this.includes(request, id))
    );
  }

  private settleRequests(): void {
    for (const request of this.requests) {
      if ([...this.queue.keys()].some((id) => this.includes(request, id))) continue;
      this.requests.delete(request);
      if (request.failures.length) request.reject(request.failures[0]);
      else request.resolve();
    }
  }

  private async run(): Promise<void> {
    try {
      while (this.options.canRun()) {
        this.settleRequests();
        if (!this.requests.size) return;
        const ids = this.pendingIds();
        let next: QueuedSnapshot | undefined;
        let earliest = Infinity;
        const now = Date.now();
        for (const id of ids) {
          const snapshot = this.queue.get(id)!;
          const retry = this.retries.get(id);
          const readyAt = retry?.revision === snapshot.revision ? retry.readyAt : 0;
          if (readyAt > now) {
            earliest = Math.min(earliest, readyAt);
            continue;
          }
          if (!next || (this.served.get(id) ?? 0) < (this.served.get(next.notebookId) ?? 0))
            next = snapshot;
        }
        if (!next) {
          await this.waitUntil(earliest);
          continue;
        }
        this.served.set(next.notebookId, ++this.turn);
        await this.attempt(next);
      }
      // Explicit teardown stops further attempts; the owner discards remaining data.
      for (const request of this.requests) request.resolve();
    } catch (error) {
      for (const request of this.requests) request.reject(error);
    } finally {
      this.wake?.();
      this.requests.clear();
      this.retries.clear();
      this.served.clear();
      this.turn = 0;
      this.worker = null;
    }
  }

  private async attempt(snapshot: QueuedSnapshot): Promise<void> {
    const id = snapshot.notebookId;
    const retry = this.retries.get(id);
    const failures = retry?.revision === snapshot.revision ? retry.failures : 0;
    this.queue.begin(snapshot);
    try {
      const recovery = await this.options.write(snapshot);
      if (recovery) {
        let retained = this.queue.get(id) ?? snapshot;
        for (;;) {
          await recovery.retain(retained);
          const latest = this.queue.get(id);
          if (!latest || latest.revision === retained.revision) break;
          retained = latest;
        }
        // No await between the final revision check and fail(): edits arriving
        // after this point observe blocked and enqueue a fresh scheduled revision.
        throw recovery.error;
      }
    } catch (error) {
      const terminal = this.options.retryable?.(error) === false;
      const exhausted = terminal || failures >= this.options.maxRetries;
      this.queue.fail(snapshot, error, exhausted, terminal);
      if (!terminal && this.queue.get(id)?.revision !== snapshot.revision) {
        this.retries.delete(id);
      } else if (exhausted) {
        this.retries.delete(id);
        // Capture affected callers before notifying observers that may explicitly retry.
        for (const request of this.requests) {
          if (this.includes(request, id)) {
            request.blocked.add(id);
            request.failures.push(error);
          }
        }
      } else {
        this.retries.set(id, {
          revision: snapshot.revision,
          failures: failures + 1,
          readyAt: Date.now() + this.options.retryDelayMs,
        });
      }
      this.options.failed(snapshot, error);
      return;
    }
    this.queue.acknowledge(snapshot);
    this.retries.delete(id);
    this.options.committed(snapshot);
  }

  private waitUntil(deadline: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
      this.wake = finish;
    });
  }
}
