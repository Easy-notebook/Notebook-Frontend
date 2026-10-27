type MaintenanceState =
  | { kind: 'idle' }
  | { kind: 'initializing'; promise: Promise<void> }
  | { kind: 'ready' }
  | { kind: 'closing'; promise: Promise<void> }
  | { kind: 'closed' }
  | { kind: 'close-failed' };

interface MaintenanceHooks {
  initialize(): Promise<void>;
  close(): Promise<void>;
  maintain(): Promise<void>;
  onError(error: unknown): void;
}

/** Owns manager operations and its periodic timer, independently of connection transactions. */
export class StorageMaintenanceLifecycle {
  private state: MaintenanceState = { kind: 'idle' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly operations = new Set<Promise<unknown>>();

  constructor(
    private readonly hooks: MaintenanceHooks,
    private readonly interval = 60 * 60 * 1000
  ) {}

  initialize(): Promise<void> {
    if (this.state.kind === 'ready') return Promise.resolve();
    if (this.state.kind === 'initializing') return this.state.promise;
    if (this.state.kind === 'closing' || this.state.kind === 'close-failed') {
      return Promise.reject(
        new Error('Storage maintenance must finish closing before initialization')
      );
    }
    const promise = Promise.resolve()
      .then(() => this.hooks.initialize())
      .then(
        () => {
          if (this.state !== initializing) return;
          this.state = { kind: 'ready' };
          this.schedule();
        },
        (error) => {
          if (this.state === initializing) this.state = { kind: 'idle' };
          throw error;
        }
      );
    const initializing: MaintenanceState = { kind: 'initializing', promise };
    this.state = initializing;
    return promise;
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (
      this.state.kind === 'closing' ||
      this.state.kind === 'closed' ||
      this.state.kind === 'close-failed'
    ) {
      return Promise.reject(new Error('Storage maintenance is closed to new operations'));
    }
    const initialization = this.state.kind === 'initializing' ? this.state.promise : undefined;
    const promise = Promise.resolve(initialization).then(operation);
    this.operations.add(promise);
    const release = () => {
      this.operations.delete(promise);
    };
    void promise.then(release, release);
    return promise;
  }

  close(): Promise<void> {
    if (this.state.kind === 'closed') return Promise.resolve();
    if (this.state.kind === 'closing') return this.state.promise;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const pending = [...this.operations];
    if (this.state.kind === 'initializing') pending.push(this.state.promise);
    const promise = Promise.allSettled(pending)
      .then(() => this.hooks.close())
      .then(
        () => {
          this.state = { kind: 'closed' };
        },
        (error) => {
          this.state = { kind: 'close-failed' };
          throw error;
        }
      );
    this.state = { kind: 'closing', promise };
    return promise;
  }

  private schedule(): void {
    if (this.state.kind !== 'ready') return;
    const owner = this.state;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.run(() => this.hooks.maintain())
        .catch((error) => this.hooks.onError(error))
        .finally(() => {
          if (this.state === owner) this.schedule();
        });
    }, this.interval);
  }
}
