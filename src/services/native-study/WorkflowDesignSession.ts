import { z } from 'zod';
import {
  WorkflowDesignClient,
  workflowContext,
  workflowDraftInput,
  workflowExecutionInput,
  workflowContinuationInput,
  type WorkflowContinuationInput,
  type WorkflowDraftInput,
  type WorkflowExecutionInput,
} from './WorkflowDesignClient';
type DraftResponse = ReturnType<WorkflowDesignClient['parseDraft']>;
type ContinuationResponse = ReturnType<WorkflowDesignClient['parseContinuation']>;
type ExecutionResponse = ReturnType<WorkflowDesignClient['parseExecution']>;
const saved = z
  .object({
    version: z.literal(1),
    input: workflowDraftInput,
    phase: z.enum(['drafting', 'review', 'executing', 'continuing', 'completed', 'suspended']),
    draft: z.unknown().optional(),
    execution: workflowExecutionInput.optional(),
    result: z.unknown().optional(),
    continuation: workflowContinuationInput.optional(),
    continuationResult: z.unknown().optional(),
  })
  .strict();
export interface WorkflowRecord {
  version: 1;
  input: WorkflowDraftInput;
  phase: z.infer<typeof saved>['phase'];
  draft?: DraftResponse;
  execution?: WorkflowExecutionInput;
  result?: ExecutionResponse;
  continuation?: WorkflowContinuationInput;
  continuationResult?: ContinuationResponse;
}
export interface WorkflowSnapshot {
  record: WorkflowRecord | null;
  busy: boolean;
  blocked: boolean;
  error: string | null;
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Persist before dispatch; response loss never creates a replacement operation ID. */
export class WorkflowDesignSession {
  private snapshot: WorkflowSnapshot = { record: null, busy: false, blocked: false, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly abort = new AbortController();
  private readonly key: string;
  private storage: StoragePort | null = null;
  constructor(
    private readonly client: WorkflowDesignClient,
    private readonly workspace: string,
    private readonly revision: number,
    storage?: StoragePort
  ) {
    this.key = `aal-workflow-design:${JSON.stringify([client.notebookId, workspace, revision])}`;
    try {
      this.storage = storage ?? sessionStorage;
      const raw = this.storage.getItem(this.key);
      if (raw) this.snapshot.record = this.validate(JSON.parse(raw));
    } catch (error) {
      this.snapshot = { ...this.snapshot, blocked: true, error: String(error) };
    }
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<WorkflowSnapshot>) {
    if (this.abort.signal.aborted) return;
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }
  private validate(raw: unknown): WorkflowRecord {
    const r = saved.parse(raw);
    if (r.input.workspace !== this.workspace || r.input.expected_revision !== this.revision)
      throw new Error('保存的工作流操作不属于当前工作区版本。');
    const record: WorkflowRecord = { version: 1, input: r.input, phase: r.phase };
    if (
      ['drafting', 'review', 'executing'].includes(r.phase) &&
      (r.continuation !== undefined || r.continuationResult !== undefined)
    )
      throw new Error('工作流阶段不能包含继续操作。');
    if (r.phase === 'drafting') {
      if (r.draft !== undefined || r.execution !== undefined || r.result !== undefined)
        throw new Error('工作流草稿阶段数据不一致。');
    } else {
      record.draft = this.client.parseDraft(r.draft, r.input);
      if (r.phase === 'review') {
        if (r.execution !== undefined || r.result !== undefined)
          throw new Error('未确认的工作流不能包含执行结果。');
      } else {
        const execution = workflowExecutionInput.parse(r.execution);
        const context = workflowContext.strip().parse(r.input);
        context.invocation = execution.context.invocation;
        if (
          JSON.stringify(execution.context) !== JSON.stringify(context) ||
          execution.context.invocation === r.input.invocation ||
          execution.draft !== record.draft.draft.draft ||
          execution.expected_fingerprint !== record.draft.draft.checked.fingerprint
        )
          throw new Error('保存的执行输入与已审阅草稿不一致。');
        record.execution = execution;
        if (r.phase === 'executing') {
          if (r.result !== undefined) throw new Error('未确认的执行不能包含结果。');
        } else {
          record.result = this.client.parseExecution(r.result, execution);
          if (r.continuation !== undefined) {
            const continuation = workflowContinuationInput.parse(r.continuation);
            const original = workflowExecutionInput.parse(continuation.execution);
            original.context.invocation = execution.context.invocation;
            if (
              record.result.result.execution.status !== 'suspended' ||
              continuation.execution_invocation !== execution.context.invocation ||
              continuation.execution.context.invocation === r.input.invocation ||
              JSON.stringify(original) !== JSON.stringify(execution)
            )
              throw new Error('继续操作与原始挂起执行不一致。');
            record.continuation = continuation;
            if (r.phase === 'continuing') {
              if (r.continuationResult !== undefined)
                throw new Error('未确认的继续操作不能包含结果。');
            } else {
              record.continuationResult = this.client.parseContinuation(
                r.continuationResult,
                continuation
              );
              if (
                record.continuationResult.result.deployment !== record.result.result.deployment ||
                record.continuationResult.reference_id !== record.result.reference_id ||
                record.continuationResult.query_data_id !== record.result.query_data_id ||
                record.continuationResult.result.execution.status !== r.phase
              )
                throw new Error('继续操作的执行身份或状态不一致。');
            }
          } else if (
            r.continuationResult !== undefined ||
            record.result.result.execution.status !== r.phase
          )
            throw new Error('工作流结果状态不一致。');
        }
      }
    }
    return freeze(record);
  }
  private save(record: WorkflowRecord) {
    const checked = this.validate(JSON.parse(JSON.stringify(record)));
    if (!this.storage) throw new Error('浏览器存储不可用，未发送工作流请求。');
    this.storage.setItem(this.key, JSON.stringify(checked));
    this.publish({ record: checked, error: null });
  }
  private available() {
    return !this.abort.signal.aborted && !this.snapshot.busy && !this.snapshot.blocked;
  }
  async prepare(input: Omit<WorkflowDraftInput, 'invocation'>) {
    if (!this.available() || this.snapshot.record) return;
    try {
      this.save({
        version: 1,
        input: workflowDraftInput.parse({ ...input, invocation: crypto.randomUUID() }),
        phase: 'drafting',
      });
      await this.resume();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  /** Explicit UI confirmation must pass the fingerprint that was displayed. */
  async execute(reviewedFingerprint: string) {
    const record = this.snapshot.record;
    if (!this.available() || record?.phase !== 'review' || !record.draft) return;
    try {
      if (reviewedFingerprint !== record.draft.draft.checked.fingerprint)
        throw new Error('待执行代码与已查看的指纹不一致。');
      const context = workflowContext.strip().parse(record.input);
      context.invocation = crypto.randomUUID();
      this.save({
        ...record,
        phase: 'executing',
        execution: {
          context,
          draft: record.draft.draft.draft,
          expected_fingerprint: reviewedFingerprint,
        },
      });
      await this.resume();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async continue() {
    const record = this.snapshot.record;
    if (!this.available() || record?.phase !== 'suspended' || !record.execution) return;
    try {
      const execution = workflowExecutionInput.parse(record.execution);
      execution.context.invocation = crypto.randomUUID();
      this.save({
        ...record,
        phase: 'continuing',
        continuationResult: undefined,
        continuation: { execution, execution_invocation: record.execution.context.invocation },
      });
      await this.resume();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async resume() {
    const record = this.snapshot.record;
    if (
      !this.available() ||
      !record ||
      !['drafting', 'executing', 'continuing'].includes(record.phase)
    )
      return;
    this.publish({ busy: true, error: null });
    try {
      if (record.phase === 'drafting') {
        const draft = await this.client.draft(record.input, this.abort.signal);
        this.abort.signal.throwIfAborted();
        this.save({ ...record, draft, phase: 'review' });
      } else if (record.phase === 'continuing') {
        const continuationResult = await this.client.continue(
          record.continuation!,
          this.abort.signal
        );
        this.abort.signal.throwIfAborted();
        this.save({
          ...record,
          continuationResult,
          phase: continuationResult.result.execution.status,
        });
      } else {
        const result = await this.client.execute(record.execution!, this.abort.signal);
        this.abort.signal.throwIfAborted();
        this.save({ ...record, result, phase: result.result.execution.status });
      }
    } catch (error) {
      this.publish({ error: String(error) });
    } finally {
      this.publish({ busy: false });
    }
  }
  clear() {
    if (
      !this.available() ||
      !this.snapshot.record ||
      !['review', 'completed'].includes(this.snapshot.record.phase)
    )
      return;
    try {
      if (!this.storage) throw new Error('浏览器存储不可用。');
      this.storage.removeItem(this.key);
      this.publish({ record: null, error: null });
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  dispose() {
    this.abort.abort();
    this.listeners.clear();
  }
}
