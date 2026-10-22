import { previewSchema } from './SkillReviewClient';
import { z } from 'zod';
import {
  SkillReviewExecutionClient,
  reviewInput,
  approvalSchema,
  type ReviewInput,
} from './SkillReviewExecutionClient';
const recordSchema = z
  .object({
    version: z.literal(1),
    input: reviewInput,
    phase: z.enum(['request', 'decision', 'execute', 'ready', 'completed']),
    approve: z.boolean().optional(),
    approval: approvalSchema.optional(),
    preview: previewSchema.optional(),
    result: z.string().optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      (r.phase === 'decision' && r.approve === undefined) ||
      (r.phase === 'execute' && r.approval?.state.status !== 'approved') ||
      (r.phase === 'ready' && (!r.approval || !r.preview)) ||
      (r.phase === 'completed' && r.result === undefined)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Incomplete persisted skill review state' });
    }
  });
export type ReviewRecord = z.infer<typeof recordSchema>;
export interface ReviewSnapshot {
  record: ReviewRecord | null;
  busy: boolean;
  error: string | null;
  blocked: boolean;
}
/** Persist before each external step; unknown outcomes replay the same step and input. */
export class SkillReviewSession {
  private snapshot: ReviewSnapshot = { record: null, busy: false, error: null, blocked: false };
  private readonly listeners = new Set<() => void>();
  private readonly controller = new AbortController();
  private readonly key: string;
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;
  constructor(
    private readonly client: SkillReviewExecutionClient,
    private readonly workspace: string,
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  ) {
    this.key = `aal-skill-review:${JSON.stringify([client.notebookId, workspace])}`;
    try {
      this.storage = storage ?? sessionStorage;
      const raw = this.storage.getItem(this.key);
      if (raw) {
        const record = recordSchema.parse(JSON.parse(raw));
        if (record.input.workspace !== workspace)
          throw new Error('保存的技能调用不属于当前工作区。');
        this.snapshot.record = record;
      }
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
  private publish(change: Partial<ReviewSnapshot>) {
    if (this.controller.signal.aborted) return;
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }
  private save(record: ReviewRecord) {
    const frozen = recordSchema.parse(JSON.parse(JSON.stringify(record)));
    if (!this.storage) throw new Error('浏览器存储不可用，未发送技能调用。');
    this.storage.setItem(this.key, JSON.stringify(frozen));
    this.publish({ record: frozen, error: null });
  }
  private available() {
    return !this.controller.signal.aborted && !this.snapshot.busy && !this.snapshot.blocked;
  }
  async prepare(draft: Omit<ReviewInput, 'invocation' | 'lock'> & { lock: unknown }) {
    if (!this.available() || this.snapshot.record) return;
    try {
      const input = reviewInput.parse({ ...draft, invocation: crypto.randomUUID() });
      if (input.workspace !== this.workspace) throw new Error('技能调用工作区不一致。');
      this.save({ version: 1, input, phase: 'request' });
      await this.resume();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async decide(approve: boolean) {
    const record = this.snapshot.record;
    if (
      !this.available() ||
      record?.phase !== 'ready' ||
      record.approval?.state.status !== 'pending'
    )
      return;
    try {
      this.save({ ...record, phase: 'decision', approve });
      await this.resume();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async execute() {
    const record = this.snapshot.record;
    if (
      !this.available() ||
      record?.phase !== 'ready' ||
      record.approval?.state.status !== 'approved'
    )
      return;
    try {
      this.save({ ...record, phase: 'execute' });
      await this.resume();
    } catch (error) {
      this.publish({ error: String(error) });
    }
  }
  async resume() {
    const record = this.snapshot.record;
    if (!this.available() || !record || ['ready', 'completed'].includes(record.phase)) return;
    this.publish({ busy: true, error: null });
    try {
      const signal = this.controller.signal;
      if (record.phase === 'execute') {
        const result = await this.client.execute(record.input, signal);
        signal.throwIfAborted();
        this.save({ ...record, phase: 'completed', result });
      } else {
        const outcome =
          record.phase === 'request'
            ? await this.client.request(record.input, signal)
            : {
                approval: await this.client.decide(record.input, record.approve!, signal),
                preview: record.preview,
              };
        signal.throwIfAborted();
        if (
          record.approval &&
          (outcome.approval.id !== record.approval.id ||
            outcome.approval.scope !== record.approval.scope)
        ) {
          throw new Error('审批身份发生变化，保留原调用等待核对。');
        }
        this.save({ ...record, phase: 'ready', ...outcome });
      }
    } catch (error) {
      this.publish({ error: String(error) });
    } finally {
      this.publish({ busy: false });
    }
  }
  clearCompleted() {
    if (
      !this.available() ||
      !(
        this.snapshot.record?.phase === 'completed' ||
        this.snapshot.record?.approval?.state.status === 'denied'
      )
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
    this.controller.abort();
    this.listeners.clear();
  }
}
