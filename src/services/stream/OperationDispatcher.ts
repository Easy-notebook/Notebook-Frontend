import type { Operation, OperationSubmission } from '@Store/models/operation';
import { OperationStreamReader } from './OperationStreamReader';

interface OperationPorts {
  initialize(): Promise<string | false>;
  open(
    notebookId: string,
    operation: Operation,
    signal: AbortSignal
  ): Promise<ReadableStream<Uint8Array> | null>;
  record(operation: Operation): string;
  receive(operationId: string, data: Record<string, unknown>, signal: AbortSignal): Promise<void>;
  busy(value: boolean): void;
  error(message: string): void;
  refused(message: string): void;
}
interface Attempt {
  phase: 'initializing' | 'connecting' | 'streaming' | 'complete' | 'failed' | 'cancelled';
  notebookId: string | null;
  controller: AbortController;
}

/** Owns notebook-bound admission and stream completion, including superseded cleanup. */
export class OperationDispatcher {
  private current: Attempt | undefined;
  constructor(private readonly ports: OperationPorts) {}

  notebookChanged(previous: string | null, next: string | null): void {
    const attempt = this.current;
    if (!attempt || previous === next) return;
    if (attempt.phase === 'initializing' && attempt.notebookId === null && previous === null) {
      // Kernel initialization may create the first notebook; validate its returned ID afterward.
      attempt.notebookId = next;
      return;
    }
    this.cancel();
  }
  cancel(): void {
    const attempt = this.current;
    if (!attempt) return;
    this.current = undefined;
    attempt.phase = 'cancelled';
    try {
      this.ports.busy(false);
    } finally {
      attempt.controller.abort(new DOMException('Notebook operation cancelled', 'AbortError'));
    }
  }
  private assertCurrent(attempt: Attempt): void {
    attempt.controller.signal.throwIfAborted();
    if (this.current !== attempt) throw new DOMException('Operation superseded', 'AbortError');
  }
  private async wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      return await Promise.race([promise, cancelled]);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  async submit(notebookId: string | null, operation: Operation): Promise<OperationSubmission> {
    if (this.current) {
      const message = '正在处理其他操作，请稍后...';
      this.ports.refused(message);
      return { accepted: false, reason: 'busy', message };
    }
    const attempt: Attempt = {
      phase: notebookId ? 'connecting' : 'initializing',
      notebookId,
      controller: new AbortController(),
    };
    this.current = attempt;
    const signal = attempt.controller.signal;
    const response: { unclaimed: ReadableStream<Uint8Array> | null } = { unclaimed: null };
    try {
      const captured = structuredClone(operation);
      this.ports.busy(true);
      this.assertCurrent(attempt);
      if (!notebookId) {
        const kernelId = await this.wait(this.ports.initialize(), signal);
        this.assertCurrent(attempt);
        if (!kernelId) throw new Error('无法初始化内核');
        if (attempt.notebookId !== null && attempt.notebookId !== kernelId) {
          this.cancel();
          this.assertCurrent(attempt);
        }
        notebookId = kernelId;
        attempt.notebookId = kernelId;
      }
      attempt.phase = 'connecting';
      const operationId = this.ports.record(captured);
      this.assertCurrent(attempt);
      const connection = this.ports.open(notebookId, captured, signal);
      // Some transports cannot abort opening; reclaim a response that arrives after cancellation.
      void connection
        .then((stream) => {
          response.unclaimed = stream;
          if (signal.aborted && stream) return stream.cancel(signal.reason);
        })
        .catch(() => {});
      const stream = await this.wait(connection, signal);
      this.assertCurrent(attempt);
      if (!stream) throw new Error('Operation response has no stream body');
      attempt.phase = 'streaming';
      const completion = this.consume(attempt, operationId, stream);
      response.unclaimed = null;
      return { accepted: true, operationId, completion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (signal.aborted || this.current !== attempt) {
        if (response.unclaimed) void response.unclaimed.cancel(signal.reason).catch(() => {});
        return { accepted: false, reason: 'cancelled', message };
      }
      attempt.phase = 'failed';
      try {
        this.ports.error(message);
      } finally {
        this.finish(attempt);
      }
      return { accepted: false, reason: 'failed', message };
    }
  }
  private async consume(
    attempt: Attempt,
    operationId: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<void> {
    const signal = attempt.controller.signal;
    try {
      await new OperationStreamReader().consume(
        stream,
        (data) => {
          this.assertCurrent(attempt);
          return this.ports.receive(operationId, data, signal);
        },
        signal
      );
      attempt.phase = 'complete';
    } catch (error) {
      if (!signal.aborted && this.current === attempt) {
        attempt.phase = 'failed';
        this.ports.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.finish(attempt);
    }
  }
  private finish(attempt: Attempt): void {
    if (this.current !== attempt) return;
    this.current = undefined;
    this.ports.busy(false);
  }
}
