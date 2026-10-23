import { z } from 'zod';
import {
  WorkflowDesignClient,
  workflowContext,
  workflowDraftInput,
  workflowExecutionInput,
  workflowContinuationInput,
  workflowPublicationInput,
  type WorkflowPublicationInput,
  type WorkflowContinuationInput,
  type WorkflowDraftInput,
  type WorkflowExecutionInput,
} from './WorkflowDesignClient';
type DraftResponse = ReturnType<WorkflowDesignClient['parseDraft']>;
type ContinuationResponse = ReturnType<WorkflowDesignClient['parseContinuation']>;
type ExecutionResponse = ReturnType<WorkflowDesignClient['parseExecution']>;
type PublicationResponse = ReturnType<WorkflowDesignClient['parsePublication']>;
const publication = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending'), input: workflowPublicationInput }).strict(),
  z
    .object({ state: z.literal('confirmed'), input: workflowPublicationInput, result: z.unknown() })
    .strict(),
]);
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
    publication: publication.optional(),
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
  publication?:
    | { state: 'pending'; input: WorkflowPublicationInput }
    | { state: 'confirmed'; input: WorkflowPublicationInput; result: PublicationResponse };
}
export interface WorkflowSnapshot {
  record: WorkflowRecord | null;
  busy: boolean;
  blocked: boolean;
  error: string | null;
  assessment?: ReturnType<WorkflowDesignClient['parseAssessment']>;
  currentEvidence?: ReturnType<WorkflowDesignClient['parseEvidence']>;
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
    if (r.publication) {
      if (record.phase !== 'completed' || !record.execution || !record.result)
        throw new Error('只有已确认完成的执行可以包含证据发布。');
      const expected = {
        execution: record.execution,
        continuation_invocation: record.continuationResult
          ? record.continuation?.execution.context.invocation
          : undefined,
      };
      if (JSON.stringify(r.publication.input.assessment) !== JSON.stringify(expected))
        throw new Error('保存的发布输入与执行记录不一致。');
      record.publication =
        r.publication.state === 'pending'
          ? r.publication
          : {
              ...r.publication,
              result: this.client.parsePublication(
                r.publication.result,
                r.publication.input,
                record.continuationResult ?? record.result
              ),
            };
    }
    return freeze(record);
  }
  private save(record: WorkflowRecord) {
    const checked = this.validate(JSON.parse(JSON.stringify(record)));
    if (!this.storage) throw new Error('浏览器存储不可用，未发送工作流请求。');
    this.storage.setItem(this.key, JSON.stringify(checked));
    this.publish({
      record: checked,
      error: null,
      assessment: undefined,
      currentEvidence: undefined,
    });
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
  /** Read-only assessment is transient: reload requires a fresh native check. */
  async assess() {
    const record = this.snapshot.record;
    const result = record?.continuationResult ?? record?.result;
    if (
      !this.available() ||
      !record?.execution ||
      !result ||
      !['completed', 'suspended'].includes(record.phase)
    )
      return;
    this.publish({ busy: true, error: null, assessment: undefined, currentEvidence: undefined });
    try {
      const assessment = await this.client.assess(
        {
          execution: record.execution,
          continuation_invocation: record.continuationResult
            ? record.continuation?.execution.context.invocation
            : undefined,
        },
        result,
        this.abort.signal
      );
      this.abort.signal.throwIfAborted();
      this.publish({ assessment });
    } catch (error) {
      this.publish({ error: String(error) });
    } finally {
      this.publish({ busy: false });
    }
  }
  /** Current status is a fresh observation, never persisted as publication authority. */
  async refreshEvidence() {
    const publication = this.snapshot.record?.publication;
    if (!this.available() || publication?.state !== 'confirmed') return;
    this.publish({ busy: true, error: null, currentEvidence: undefined });
    try {
      const currentEvidence = await this.client.inspectEvidence(
        publication.result,
        this.abort.signal
      );
      this.abort.signal.throwIfAborted();
      this.publish({ currentEvidence });
    } catch (error) {
      this.publish({ error: String(error) });
    } finally {
      this.publish({ busy: false });
    }
  }
  async publishEvidence() {
    const record = this.snapshot.record;
    if (
      !this.available() ||
      record?.phase !== 'completed' ||
      !record.execution ||
      record.publication ||
      !this.snapshot.assessment ||
      this.snapshot.assessment.assessment.status === 'pending'
    )
      return;
    try {
      this.save({
        ...record,
        publication: {
          state: 'pending',
          input: {
            assessment: {
              execution: record.execution,
              continuation_invocation: record.continuationResult
                ? record.continuation?.execution.context.invocation
                : undefined,
            },
            invocation: crypto.randomUUID(),
          },
        },
      });
      await this.resumePublication();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async resumePublication() {
    const record = this.snapshot.record;
    if (!this.available() || record?.publication?.state !== 'pending' || !record.result) return;
    this.publish({ busy: true, error: null });
    try {
      const result = await this.client.publish(
        record.publication.input,
        record.continuationResult ?? record.result,
        this.abort.signal
      );
      this.abort.signal.throwIfAborted();
      this.save({
        ...record,
        publication: { state: 'confirmed', input: record.publication.input, result },
      });
    } catch (error) {
      this.publish({ error: String(error) });
    } finally {
      this.publish({ busy: false });
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
      !['review', 'completed'].includes(this.snapshot.record.phase) ||
      this.snapshot.record.publication?.state === 'pending'
    )
      return;
    try {
      if (!this.storage) throw new Error('浏览器存储不可用。');
      this.storage.removeItem(this.key);
      this.publish({
        record: null,
        error: null,
        assessment: undefined,
        currentEvidence: undefined,
      });
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  dispose() {
    this.abort.abort();
    this.listeners.clear();
  }
}
