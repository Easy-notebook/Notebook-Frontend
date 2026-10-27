interface PollingCallbacks {
  canPoll: () => boolean;
  request: () => Promise<void>;
  timeout: () => void;
  failed: (error: unknown) => void;
  stopped: () => void;
}

type PollingState =
  | { phase: 'waiting'; timer: ReturnType<typeof setTimeout> }
  | { phase: 'requesting' }
  | { phase: 'stopped' };

/** A serial polling lifetime; stopping invalidates all outstanding continuations. */
export class VideoPollingSession {
  private state: PollingState;
  private attempts = 0;

  constructor(
    private readonly maxAttempts: number,
    private readonly interval: number,
    private readonly callbacks: PollingCallbacks
  ) {
    if (
      !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < 1 ||
      !Number.isFinite(interval) ||
      interval < 0
    )
      throw new Error('Invalid video polling limits');
    this.state = this.waiting();
  }

  stop(): void {
    if (this.state.phase === 'stopped') return;
    if (this.state.phase === 'waiting') clearTimeout(this.state.timer);
    this.state = { phase: 'stopped' };
    this.callbacks.stopped();
  }

  private waiting(): PollingState {
    return { phase: 'waiting', timer: setTimeout(() => void this.poll(), this.interval) };
  }

  private get active(): boolean {
    return this.state.phase !== 'stopped';
  }

  private async poll(): Promise<void> {
    if (!this.active) return;
    if (!this.callbacks.canPoll()) {
      this.stop();
      return;
    }
    this.state = { phase: 'requesting' };
    ++this.attempts;
    try {
      await this.callbacks.request();
      if (!this.active) return;
      if (!this.callbacks.canPoll()) {
        this.stop();
        return;
      }
      if (this.attempts >= this.maxAttempts) {
        this.stop();
        this.callbacks.timeout();
      } else {
        this.state = this.waiting();
      }
    } catch (error) {
      if (!this.active) return;
      this.stop();
      this.callbacks.failed(error);
    }
  }
}
