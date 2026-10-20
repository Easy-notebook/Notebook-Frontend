import type { NativeObservation, PendingCommand } from './contracts';
import type { NativeStudyClient } from './NativeStudyClient';

export type CommandProgress =
  | { status: 'waiting' | 'unknown' | 'unavailable'; observation: null }
  | { status: 'observed'; observation: NativeObservation };

/** Read-only observation; completion never clears or resends the durable command. */
export class NativeOperationObserver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | null = null;
  private stopped = false;
  constructor(
    private readonly client: NativeStudyClient,
    private readonly command: PendingCommand,
    private readonly publish: (progress: CommandProgress) => void
  ) {
    publish({ status: 'waiting', observation: null });
    this.schedule(500);
  }
  private schedule(delay: number) {
    this.timer = setTimeout(() => void this.poll(), delay);
  }
  private async poll() {
    if (this.stopped) return;
    const request = new AbortController();
    this.request = request;
    const deadline = setTimeout(() => request.abort(), 3000);
    let terminal = false;
    try {
      const observation = await this.client.operation(this.command, request.signal);
      request.signal.throwIfAborted();
      if (this.stopped) return;
      // No current observation is neither a result nor permission to execute again.
      this.publish(
        observation ? { status: 'observed', observation } : { status: 'unknown', observation: null }
      );
      terminal = !observation || observation.phase !== 'running';
    } catch {
      if (!this.stopped) this.publish({ status: 'unavailable', observation: null });
    } finally {
      clearTimeout(deadline);
      this.request = null;
      if (!this.stopped && !terminal) this.schedule(1000);
    }
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.request?.abort();
  }
}
