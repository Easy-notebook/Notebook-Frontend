import { canExecuteCodeLanguage } from '@Store/models/codeLanguage';
import type { CellExecutionState, ExecutionResult } from '@Store/models';
import type {
  ApiResponse,
  ExecutionResult as BackendResult,
  ExecutionOutput,
} from '@Services/types';
interface ExecutionPorts {
  notebookId(): string | null;
  cell(id: string): { content: string; language?: string } | undefined;
  watch(check: () => void): () => void;
  initialize(): Promise<string | false>;
  execute(code: string, owner: string, signal: AbortSignal): Promise<BackendResult>;
  cancel(owner: string, signal: AbortSignal): Promise<ApiResponse>;
  update(id: string, state: Partial<CellExecutionState>): void;
  clear(id: string): void;
  outputs(id: string, outputs: ExecutionOutput[]): void;
  save(): void;
  startPolling(id: string): void;
  stopPolling(id: string): void;
}
interface Attempt {
  cellId: string;
  notebookId: string | null;
  code: string;
  phase: 'initializing' | 'running' | 'cancelling' | 'settled';
  controller: AbortController;
  promise: Promise<ExecutionResult>;
  settle(result: ExecutionResult): void;
  unsubscribe(): void;
  cancellation?: Promise<ExecutionResult>;
  cancelSettle?: Attempt['settle'];
}
const failure = (error: string): ExecutionResult => ({ success: false, error });

/** One notebook kernel admits one owned execution, including initialization and cancellation. */
export class CellExecutionSession {
  private current: Attempt | undefined;
  constructor(private readonly ports: ExecutionPorts) {}
  isActive(cellId: string): boolean {
    return this.current?.cellId === cellId && this.current.phase !== 'settled';
  }
  reset(publish = false): void {
    if (this.current) this.finish(this.current, failure('execution_context_changed'), publish);
  }
  execute(cellId: string): Promise<ExecutionResult> {
    if (this.current) {
      if (this.current.cellId === cellId && this.current.phase !== 'settled')
        return this.cancel(cellId);
      return Promise.resolve(failure('kernel_busy'));
    }
    const cell = this.ports.cell(cellId);
    if (!cell) return Promise.resolve(failure('Cell does not exist'));
    if (!canExecuteCodeLanguage(cell.language))
      return Promise.resolve(
        failure(`${cell.language} execution is unavailable; the kernel runs Python only`)
      );
    let settle!: Attempt['settle'];
    const promise = new Promise<ExecutionResult>((resolve) => {
      settle = resolve;
    });
    const attempt: Attempt = {
      cellId,
      notebookId: this.ports.notebookId(),
      code: cell.content,
      phase: 'initializing',
      controller: new AbortController(),
      promise,
      settle,
      unsubscribe: () => {},
    };
    this.current = attempt;
    attempt.unsubscribe = this.ports.watch(() => {
      if (this.current !== attempt) return;
      const owner = this.ports.notebookId();
      if (attempt.phase === 'initializing' && attempt.notebookId === null && owner !== null)
        attempt.notebookId = owner;
      if (owner !== attempt.notebookId || !this.ports.cell(cellId))
        this.finish(attempt, failure('execution_context_changed'), false);
    });
    void this.run(attempt);
    return promise;
  }
  private owns(attempt: Attempt): boolean {
    return (
      this.current === attempt &&
      attempt.phase !== 'settled' &&
      !attempt.controller.signal.aborted &&
      this.ports.notebookId() === attempt.notebookId &&
      !!this.ports.cell(attempt.cellId)
    );
  }
  private async run(attempt: Attempt): Promise<void> {
    try {
      this.ports.update(attempt.cellId, { isExecuting: true, isCancelling: false, elapsedTime: 0 });
      if (!this.owns(attempt)) return;
      const kernelId = await this.ports.initialize();
      if (!this.owns(attempt)) return;
      if (!kernelId || kernelId !== attempt.notebookId) throw new Error('内核初始化失败');
      attempt.phase = 'running';
      this.ports.clear(attempt.cellId);
      if (!this.owns(attempt)) return;
      const resultPromise = this.ports.execute(attempt.code, kernelId, attempt.controller.signal);
      if (this.owns(attempt)) this.ports.startPolling(attempt.cellId);
      const result = await resultPromise;
      if (attempt.cancellation) await attempt.cancellation;
      if (!this.owns(attempt)) return;
      const reportedError = result.outputs?.find((output) => output.type === 'error');
      const message =
        result.status !== 'ok'
          ? result.error || result.message || reportedError?.content || 'Code execution failed'
          : reportedError
            ? reportedError.content || 'Unknown error'
            : undefined;
      const outputs = result.outputs?.length
        ? result.outputs
        : message
          ? [{ type: 'error' as const, content: message }]
          : [];
      this.ports.outputs(attempt.cellId, outputs);
      if (!this.owns(attempt)) return;
      this.ports.save();
      if (!this.owns(attempt)) return;
      this.finish(attempt, message ? failure(message) : { success: true, outputs: result.outputs });
    } catch (error) {
      if (attempt.cancellation) await attempt.cancellation;
      if (!this.owns(attempt)) return;
      const message = error instanceof Error ? error.message : String(error);
      this.ports.outputs(attempt.cellId, [{ type: 'error', content: message }]);
      if (this.owns(attempt)) this.finish(attempt, failure(message));
    }
  }
  cancel(cellId: string): Promise<ExecutionResult> {
    const attempt = this.current;
    if (!attempt || attempt.cellId !== cellId || attempt.phase === 'settled')
      return Promise.resolve(failure('not_executing'));
    if (attempt.cancellation) return attempt.cancellation;
    if (attempt.phase === 'initializing') {
      const result = failure('canceled_by_user');
      this.finish(attempt, result);
      return Promise.resolve(result);
    }
    let settle!: Attempt['settle'];
    const promise = new Promise<ExecutionResult>((resolve) => {
      settle = resolve;
    });
    attempt.cancellation = promise;
    attempt.cancelSettle = settle;
    attempt.phase = 'cancelling';
    void this.cancelRunning(attempt).then(settle);
    return promise;
  }
  private async cancelRunning(attempt: Attempt): Promise<ExecutionResult> {
    try {
      this.ports.stopPolling(attempt.cellId);
      if (!this.owns(attempt)) return failure('execution_context_changed');
      this.ports.update(attempt.cellId, { isCancelling: true });
      if (!this.owns(attempt)) return failure('execution_context_changed');
      const response = await this.ports.cancel(attempt.notebookId!, attempt.controller.signal);
      if (!this.owns(attempt)) return failure('execution_context_changed');
      if (response.status !== 'ok') throw new Error(response.message || 'Cancellation failed');
      const result = failure('canceled_by_user');
      this.finish(attempt, result);
      return result;
    } catch (error) {
      if (!this.owns(attempt)) return failure('execution_context_changed');
      attempt.phase = 'running';
      attempt.cancellation = undefined;
      attempt.cancelSettle = undefined;
      this.ports.update(attempt.cellId, { isCancelling: false });
      if (this.owns(attempt)) this.ports.startPolling(attempt.cellId);
      return failure(error instanceof Error ? error.message : String(error));
    }
  }
  private finish(attempt: Attempt, result: ExecutionResult, publish = true): void {
    if (this.current !== attempt || attempt.phase === 'settled') return;
    attempt.phase = 'settled';
    attempt.unsubscribe();
    attempt.controller.abort();
    this.ports.stopPolling(attempt.cellId);
    if (
      publish &&
      this.ports.notebookId() === attempt.notebookId &&
      this.ports.cell(attempt.cellId)
    )
      this.ports.update(attempt.cellId, {
        isExecuting: false,
        isCancelling: false,
        elapsedTime: 0,
      });
    this.current = undefined;
    attempt.settle(result);
    attempt.cancelSettle?.(result);
  }
}
