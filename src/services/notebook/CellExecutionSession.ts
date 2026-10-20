import { canExecuteCodeLanguage, normalizeCodeLanguage } from '@Store/models/codeLanguage';
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
  initialize(language: string): Promise<string | false>;
  execute(
    code: string,
    owner: string,
    signal: AbortSignal,
    language: string,
    cellId: string
  ): Promise<BackendResult>;
  cancel(owner: string, signal: AbortSignal, language: string): Promise<ApiResponse>;
  update(id: string, state: Partial<CellExecutionState>): void;
  clear(id: string): void;
  outputs(id: string, outputs: ExecutionOutput[]): void;
  save(): void;
  startPolling(id: string, language: string): void;
  stopPolling(id: string): void;
  batchState(phase: BatchExecutionPhase): void;
}
interface Attempt {
  cellId: string;
  notebookId: string | null;
  code: string;
  language: string;
  phase: 'initializing' | 'running' | 'cancelling' | 'settled';
  controller: AbortController;
  promise: Promise<ExecutionResult>;
  settle(result: ExecutionResult): void;
  unsubscribe(): void;
  cancellation?: Promise<ExecutionResult>;
  cancelSettle?: Attempt['settle'];
}
export interface BatchExecutionResult {
  success: boolean;
  completed: string[];
  error?: string;
  failedCellId?: string;
}
export class BatchExecutionError extends Error {
  constructor(readonly result: BatchExecutionResult) {
    super(
      `${result.failedCellId ? `Cell ${result.failedCellId}: ` : ''}${result.error || 'Batch execution incomplete'}`
    );
    this.name = 'BatchExecutionError';
  }
}
export type BatchExecutionPhase = 'idle' | 'running' | 'stopping';
interface BatchAttempt {
  owner: string;
  phase: 'admitted' | 'running' | 'stopping' | 'settled';
  cells: { id: string; content: string; language: string }[];
  completed: string[];
  promise: Promise<BatchExecutionResult>;
  settle(result: BatchExecutionResult): void;
  unsubscribe(): void;
}
const failure = (error: string): ExecutionResult => ({ success: false, error });

/** One notebook kernel admits one owned execution, including initialization and cancellation. */
export class CellExecutionSession {
  private current: Attempt | undefined;
  private batch: BatchAttempt | undefined;
  constructor(private readonly ports: ExecutionPorts) {}
  isActive(cellId: string): boolean {
    return this.current?.cellId === cellId && this.current.phase !== 'settled';
  }
  reset(publish = false): void {
    if (this.batch) this.finishBatch(this.batch, 'execution_context_changed', undefined, publish);
    if (this.current) this.finish(this.current, failure('execution_context_changed'), publish);
  }
  execute(cellId: string): Promise<ExecutionResult> {
    if (this.batch) return Promise.resolve(failure('batch_execution_active'));
    if (this.current) {
      if (this.current.cellId === cellId && this.current.phase !== 'settled')
        return this.cancel(cellId);
      return Promise.resolve(failure('kernel_busy'));
    }
    return this.start(cellId);
  }
  /** A sequence reserves the same execution owner as manual cells, including between awaits. */
  executeAll(
    cellIds: readonly string[],
    beforeCell: (cellId: string) => void = () => {}
  ): Promise<BatchExecutionResult> {
    const rejected = (error: string) => Promise.resolve({ success: false, completed: [], error });
    if (this.batch) {
      return cellIds.length === this.batch.cells.length &&
        cellIds.every((id, index) => id === this.batch!.cells[index].id)
        ? this.batch.promise
        : rejected('batch_execution_active');
    }
    if (this.current) return rejected('kernel_busy');
    const owner = this.ports.notebookId();
    if (!owner) return rejected('Notebook ID not found');
    if (!cellIds.length) return rejected('No code cells to execute');
    if (cellIds.length > 256 || new Set(cellIds).size !== cellIds.length)
      return rejected('A batch requires 1..256 distinct code cells');
    const cells: BatchAttempt['cells'] = [];
    for (const id of cellIds) {
      const cell = this.ports.cell(id);
      if (!cell) return rejected(`Cell ${id} does not exist`);
      if (!canExecuteCodeLanguage(cell.language))
        return rejected(`Cell ${id}: ${cell.language} execution is unavailable`);
      cells.push({ id, content: cell.content, language: normalizeCodeLanguage(cell.language) });
    }
    let settle!: BatchAttempt['settle'];
    const promise = new Promise<BatchExecutionResult>((resolve) => {
      settle = resolve;
    });
    const batch: BatchAttempt = {
      owner,
      cells,
      completed: [],
      phase: 'admitted',
      promise,
      settle,
      unsubscribe: () => {},
    };
    this.batch = batch;
    batch.unsubscribe = this.ports.watch(() => {
      if (this.batch !== batch) return;
      if (this.ports.notebookId() !== batch.owner)
        this.finishBatch(batch, 'execution_context_changed');
      else if (
        batch.cells.some((snapshot) => {
          const current = this.ports.cell(snapshot.id);
          return (
            !current ||
            current.content !== snapshot.content ||
            normalizeCodeLanguage(current.language) !== snapshot.language
          );
        })
      )
        this.finishBatch(batch, 'batch_source_changed');
    });
    if (this.batch !== batch) batch.unsubscribe();
    else {
      this.ports.batchState('running');
      if (this.batch === batch) void this.runBatch(batch, beforeCell);
    }
    return promise;
  }
  /** Let the admitted cell settle, then stop before dispatching another cell. */
  stopBatch(): void {
    if (!this.batch || this.batch.phase === 'settled' || this.batch.phase === 'stopping') return;
    this.batch.phase = 'stopping';
    this.ports.batchState('stopping');
  }
  private async runBatch(batch: BatchAttempt, beforeCell: (id: string) => void): Promise<void> {
    try {
      if (batch.phase === 'admitted') batch.phase = 'running';
      for (const cell of batch.cells) {
        if (this.batch !== batch) return;
        if (batch.phase === 'stopping') {
          this.finishBatch(batch, 'batch_stopped');
          return;
        }
        beforeCell(cell.id);
        if (this.batch !== batch) return;
        const result = await this.start(cell.id);
        if (this.batch !== batch) return;
        if (!result.success) {
          this.finishBatch(batch, result.error || 'Code execution failed', cell.id);
          return;
        }
        batch.completed.push(cell.id);
      }
      this.finishBatch(batch);
    } catch (error) {
      this.finishBatch(batch, error instanceof Error ? error.message : String(error));
    }
  }
  private finishBatch(
    batch: BatchAttempt,
    error?: string,
    failedCellId?: string,
    publish = true
  ): void {
    if (this.batch !== batch || batch.phase === 'settled') return;
    batch.phase = 'settled';
    batch.unsubscribe();
    // Retain admission through cell cleanup so reentrant subscribers cannot insert work.
    if (this.current)
      this.finish(this.current, failure(error || 'execution_context_changed'), publish);
    this.batch = undefined;
    this.ports.batchState('idle');
    batch.settle({ success: !error, completed: [...batch.completed], error, failedCellId });
  }
  private start(cellId: string): Promise<ExecutionResult> {
    const cell = this.ports.cell(cellId);
    if (!cell) return Promise.resolve(failure('Cell does not exist'));
    if (!canExecuteCodeLanguage(cell.language))
      return Promise.resolve(
        failure(`${cell.language} execution is unavailable; supported languages are Python and AAL`)
      );
    let settle!: Attempt['settle'];
    const promise = new Promise<ExecutionResult>((resolve) => {
      settle = resolve;
    });
    const attempt: Attempt = {
      cellId,
      notebookId: this.ports.notebookId(),
      code: cell.content,
      language: normalizeCodeLanguage(cell.language),
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
        this.finish(attempt, failure('execution_context_changed'));
    });
    if (this.current === attempt) void this.run(attempt);
    else attempt.unsubscribe();
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
      const kernelId = await this.ports.initialize(attempt.language);
      if (!this.owns(attempt)) return;
      if (!kernelId || kernelId !== attempt.notebookId) throw new Error('内核初始化失败');
      attempt.phase = 'running';
      this.ports.clear(attempt.cellId);
      if (!this.owns(attempt)) return;
      const resultPromise = this.ports.execute(
        attempt.code,
        kernelId,
        attempt.controller.signal,
        attempt.language,
        attempt.cellId
      );
      if (this.owns(attempt)) this.ports.startPolling(attempt.cellId, attempt.language);
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
      const response = await this.ports.cancel(
        attempt.notebookId!,
        attempt.controller.signal,
        attempt.language
      );
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
      if (this.owns(attempt)) this.ports.startPolling(attempt.cellId, attempt.language);
      return failure(error instanceof Error ? error.message : String(error));
    }
  }
  private finish(attempt: Attempt, result: ExecutionResult, publish = true): void {
    if (this.current !== attempt || attempt.phase === 'settled') return;
    attempt.phase = 'settled';
    attempt.unsubscribe();
    attempt.controller.abort();
    this.ports.stopPolling(attempt.cellId);
    // Execution telemetry belongs to this admitted attempt, even after navigation.
    // Keep admission until cleanup completes so this cannot clear a newer attempt.
    if (publish)
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
