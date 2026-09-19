export type RouteTransitionState =
  | { status: 'idle'; path: null }
  | { status: 'pending' | 'ready'; path: string }
  | { status: 'error'; path: string; error: unknown };

/** Serializes route-owned side effects with one replaceable pending destination. */
export class RouteTransitionCoordinator {
  private requested: string | undefined;
  private pending: string | undefined;
  private running: Promise<void> | undefined;
  private state: RouteTransitionState = { status: 'idle', path: null };
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = (): RouteTransitionState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: RouteTransitionState): void {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  constructor(
    private readonly transition: (path: string) => Promise<void>,
    private readonly onError: (path: string, error: unknown) => void,
  ) {}

  request(path: string): Promise<void> {
    if (this.requested === path) return this.running ?? Promise.resolve();
    this.requested = path;
    this.pending = path;
    // Defer the drain so synchronous/StrictMode requests share the same owner.
    this.running ??= Promise.resolve().then(() => this.drain());
    this.publish({ status: 'pending', path });
    return this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending !== undefined) {
        const path = this.pending;
        this.pending = undefined;
        try {
          await this.transition(path);
          if (this.pending === undefined) this.publish({ status: 'ready', path });
        } catch (error) {
          if (this.requested === path) this.requested = undefined;
          if (this.pending === undefined) this.publish({ status: 'error', path, error });
          this.onError(path, error);
        }
      }
    } finally {
      this.running = undefined;
    }
  }
}
