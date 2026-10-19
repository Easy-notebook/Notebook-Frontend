import type { Operation, OperationSubmission } from '@Store/models/operation';
import { OperationStreamReader } from './OperationStreamReader';

interface OperationPorts {
  initialize(): Promise<string | false>;
  open(notebookId: string, operation: Operation): Promise<ReadableStream<Uint8Array> | null>;
  record(operation: Operation): string;
  receive(operationId: string, data: Record<string, unknown>): Promise<void>;
  busy(value: boolean): void;
  error(message: string): void;
  refused(message: string): void;
}

/** Owns admission separately from stream completion; both Store APIs use this lifecycle. */
export class OperationDispatcher {
  private phase: 'idle' | 'initializing' | 'connecting' | 'streaming' = 'idle';
  constructor(private readonly ports: OperationPorts) {}

  async submit(notebookId: string | null, operation: Operation): Promise<OperationSubmission> {
    if (this.phase !== 'idle') {
      const message = '正在处理其他操作，请稍后...';
      this.ports.refused(message);
      return { accepted: false, reason: 'busy', message };
    }
    this.phase = notebookId ? 'connecting' : 'initializing';
    try {
      // Capture before any asynchronous initialization or external Store subscriber runs.
      const captured = structuredClone(operation);
      this.ports.busy(true);
      if (!notebookId) {
        const kernelId = await this.ports.initialize();
        if (!kernelId) throw new Error('无法初始化内核');
        notebookId = kernelId;
      }
      this.phase = 'connecting';
      const operationId = this.ports.record(captured);
      const stream = await this.ports.open(notebookId, captured);
      if (!stream) throw new Error('Operation response has no stream body');
      this.phase = 'streaming';
      const completion = this.consume(operationId, stream);
      return { accepted: true, operationId, completion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        this.ports.error(message);
      } finally {
        this.finish();
      }
      return { accepted: false, reason: 'failed', message };
    }
  }
  private async consume(operationId: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    try {
      await new OperationStreamReader().consume(stream, (data) =>
        this.ports.receive(operationId, data)
      );
    } catch (error) {
      this.ports.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.finish();
    }
  }
  private finish(): void {
    this.phase = 'idle';
    this.ports.busy(false);
  }
}
