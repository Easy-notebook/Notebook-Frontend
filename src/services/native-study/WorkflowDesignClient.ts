import { z } from 'zod';
import { isEqual } from 'lodash-es';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';

const boundedText = (bytes: number) =>
  z.string().refine((s) => s.trim().length > 0 && new TextEncoder().encode(s).length <= bytes);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowContext = z
  .object({
    workspace: boundedText(256),
    expected_revision: z.number().int().nonnegative().safe(),
    invocation: boundedText(128),
    reference_csv: boundedText(4 * 1024 * 1024),
    query_csv: boundedText(4 * 1024 * 1024),
    columns: z.array(boundedText(256)).min(1),
    clusters: z.number().int().positive().safe(),
    neighbors: z.number().int().min(1).max(8),
    maximum: z.number().finite().nonnegative(),
  })
  .strict();
export const workflowDraftInput = workflowContext.extend({
  goal: boundedText(8192),
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/),
});
export const workflowExecutionInput = z
  .object({
    context: workflowContext,
    draft: boundedText(256),
    expected_fingerprint: fingerprint,
  })
  .strict();
export const workflowContinuationInput = z
  .object({
    execution: workflowExecutionInput,
    execution_invocation: boundedText(128),
  })
  .strict()
  .refine((input) => input.execution.context.invocation !== input.execution_invocation);
export const workflowAssessmentInput = z
  .object({
    execution: workflowExecutionInput,
    continuation_invocation: boundedText(128).nullable().optional(),
  })
  .strict();
export const workflowPublicationInput = z
  .object({ assessment: workflowAssessmentInput, invocation: boundedText(128) })
  .strict();
export type WorkflowPublicationInput = z.infer<typeof workflowPublicationInput>;
export type WorkflowAssessmentInput = z.infer<typeof workflowAssessmentInput>;
export type WorkflowContinuationInput = z.infer<typeof workflowContinuationInput>;
export type WorkflowContext = z.infer<typeof workflowContext>;
export type WorkflowDraftInput = z.infer<typeof workflowDraftInput>;
export type WorkflowExecutionInput = z.infer<typeof workflowExecutionInput>;

export const workflowDiscussionInput = z
  .object({ context: workflowContext, message: boundedText(8192) })
  .strict();
export type WorkflowDiscussionInput = z.infer<typeof workflowDiscussionInput>;
const evidenceContext = z
  .object({
    owner: z.literal('WorkflowEvidence'),
    scope: z.literal('measured_instance_only'),
    claim_id: boundedText(4096),
    status: z.enum(['supported', 'refuted', 'stale']),
    source: z
      .object({
        agent: z.literal('WorkflowEvidence'),
        invocation: boundedText(128),
        call_id: boundedText(4096),
      })
      .strict(),
    applicable: z.boolean(),
    input_mismatches: z.array(
      z.enum([
        'reference_id',
        'query_data_id',
        'selection',
        'selected_count',
        'maximum_distance_squared',
      ])
    ),
    contract: z.literal('housing-neighbor-selection-v1'),
    execution_id: boundedText(128),
    operation_id: boundedText(128),
    deployment: boundedText(256),
    fingerprint,
    reference_id: boundedText(256),
    query_data_id: boundedText(256),
    maximum_distance_squared: z.number().finite().nonnegative(),
    assessment_status: z.enum(['matched', 'mismatched']),
    assessment_mismatches: z.array(
      z.enum(['reference_id', 'query_data_id', 'selection', 'selected_count'])
    ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.applicable !== (v.input_mismatches.length === 0) ||
      (v.assessment_status === 'matched') !== (v.assessment_mismatches.length === 0) ||
      (v.status !== 'stale' &&
        v.status !== (v.assessment_status === 'matched' ? 'supported' : 'refuted'))
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '证据状态不一致。' });
  });

const outcome = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('completed'), value: z.unknown() }).strict(),
    z
      .object({
        status: z.literal('suspended'),
        workflow: boundedText(1024),
        state: boundedText(1024),
        invocation: boundedText(1024),
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.status === 'completed' && !Object.prototype.hasOwnProperty.call(value, 'value'))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Completed workflow has no value' });
  });

/** Validates native envelopes; generated outputs remain untrusted business data. */
export class WorkflowDesignClient {
  private readonly transport: NativeNotebookTransport;
  constructor(readonly notebookId: string) {
    this.transport = new NativeNotebookTransport(notebookId);
  }
  private identity(input: WorkflowContext) {
    return z.object({
      frontend_notebook_id: z.literal(this.notebookId),
      workspace: z.literal(input.workspace),
      revision: z.literal(input.expected_revision),
      invocation: z.literal(input.invocation),
      reference_id: boundedText(256),
      query_data_id: boundedText(256),
    });
  }
  private async send(
    route:
      | 'workflow/draft'
      | 'workflow/execute'
      | 'workflow/resume'
      | 'workflow/assess'
      | 'workflow/publish'
      | 'workflow/evidence'
      | 'workflow/discuss',
    input: unknown,
    signal: AbortSignal
  ) {
    signal.throwIfAborted();
    if (new TextEncoder().encode(JSON.stringify(input)).length > 5 * 1024 * 1024)
      throw new Error('工作流请求超过 5 MiB。');
    const result = await this.transport.send(route, input, signal);
    signal.throwIfAborted();
    return result;
  }
  async draft(raw: WorkflowDraftInput, signal: AbortSignal) {
    // Parsing copies inputs before awaiting; caller edits cannot rebind a response.
    const input = workflowDraftInput.parse(raw);
    return this.parseDraft(await this.send('workflow/draft', input, signal), input);
  }
  parseDraft(response: unknown, input: WorkflowDraftInput) {
    const shape = this.identity(input)
      .extend({
        execution_authorized: z.literal(false),
        draft: z
          .object({
            draft: boundedText(256),
            source: boundedText(65536),
            checked: z.object({ valid: z.literal(true), fingerprint }).strict(),
            inspection: z
              .object({
                name: z.literal(input.name),
                owned: z.literal(true),
                public: z.record(z.string(), z.unknown()),
                state: z.null(),
                revision: z.number().int().nonnegative().safe(),
              })
              .strict(),
          })
          .strict(),
      })
      .strict();
    return shape.parse(response);
  }
  async execute(raw: WorkflowExecutionInput, signal: AbortSignal) {
    const input = workflowExecutionInput.parse(raw);
    return this.parseExecution(await this.send('workflow/execute', input, signal), input);
  }
  parseExecution(response: unknown, input: WorkflowExecutionInput) {
    return this.executionShape(input).parse(response);
  }
  async continue(raw: WorkflowContinuationInput, signal: AbortSignal) {
    const input = workflowContinuationInput.parse(raw);
    return this.parseContinuation(await this.send('workflow/resume', input, signal), input);
  }
  parseContinuation(response: unknown, input: WorkflowContinuationInput) {
    return this.executionShape(input.execution)
      .extend({
        execution_invocation: z.literal(input.execution_invocation),
      })
      .strict()
      .parse(response);
  }
  async assess(
    raw: WorkflowAssessmentInput,
    recorded: ReturnType<WorkflowDesignClient['parseExecution']>,
    signal: AbortSignal
  ) {
    const input = workflowAssessmentInput.parse(raw);
    const original = structuredClone(recorded);
    return this.parseAssessment(await this.send('workflow/assess', input, signal), input, original);
  }
  parseAssessment(
    response: unknown,
    input: WorkflowAssessmentInput,
    recorded: ReturnType<WorkflowDesignClient['parseExecution']>
  ) {
    const operation = input.continuation_invocation ?? input.execution.context.invocation;
    if (
      recorded.invocation !== operation ||
      recorded.frontend_notebook_id !== this.notebookId ||
      recorded.workspace !== input.execution.context.workspace ||
      recorded.revision !== input.execution.context.expected_revision ||
      recorded.result.fingerprint !== input.execution.expected_fingerprint
    )
      throw new Error('验收目标与执行记录不一致。');
    const expected = z
      .object({
        reference_id: z.literal(recorded.reference_id),
        query_data_id: z.literal(recorded.query_data_id),
        selection: z.array(
          z
            .object({
              query_row: z.number().int().nonnegative().safe(),
              selected_rows: z.array(z.number().int().nonnegative().safe()),
            })
            .strict()
        ),
        selected_count: z.number().int().nonnegative().safe(),
      })
      .strict();
    const parsed = this.identity(input.execution.context)
      .extend({
        reference_id: z.literal(recorded.reference_id),
        query_data_id: z.literal(recorded.query_data_id),
        assessment: z
          .object({
            contract: z.literal('housing-neighbor-selection-v1'),
            status: z.enum(['pending', 'matched', 'mismatched']),
            execution_id: z.literal(input.execution.context.invocation),
            operation_id: z.literal(operation),
            deployment: z.literal(recorded.result.deployment),
            fingerprint: z.literal(input.execution.expected_fingerprint),
            expected,
            observed: z.unknown(),
            mismatches: z.array(
              z.enum(['reference_id', 'query_data_id', 'selection', 'selected_count'])
            ),
          })
          .strict(),
      })
      .strict()
      .parse(response);
    const assessment = parsed.assessment;
    const outcome = recorded.result.execution;
    const observed = outcome.status === 'suspended' ? null : outcome.value;
    const differences =
      outcome.status === 'suspended'
        ? []
        : Object.keys(assessment.expected)
            .filter(
              (key) =>
                !isEqual(
                  (observed as Record<string, unknown> | null)?.[key],
                  assessment.expected[key as keyof typeof assessment.expected]
                )
            )
            .sort();
    const status =
      outcome.status === 'suspended' ? 'pending' : differences.length ? 'mismatched' : 'matched';
    if (
      !isEqual(observed, assessment.observed) ||
      assessment.status !== status ||
      !isEqual([...assessment.mismatches].sort(), differences) ||
      assessment.expected.selected_count !==
        assessment.expected.selection.reduce((n, row) => n + row.selected_rows.length, 0)
    )
      throw new Error('验收结果与原生执行记录不一致。');
    return parsed;
  }
  async publish(
    raw: WorkflowPublicationInput,
    recorded: ReturnType<WorkflowDesignClient['parseExecution']>,
    signal: AbortSignal
  ) {
    const input = workflowPublicationInput.parse(raw);
    const original = structuredClone(recorded);
    return this.parsePublication(
      await this.send('workflow/publish', input, signal),
      input,
      original
    );
  }
  parsePublication(
    response: unknown,
    input: WorkflowPublicationInput,
    recorded: ReturnType<WorkflowDesignClient['parseExecution']>
  ) {
    const parsed = this.identity(input.assessment.execution.context)
      .extend({
        publication_invocation: z.literal(input.invocation),
        publication: z
          .object({
            assessment: z.record(z.string(), z.unknown()),
            evidence: z
              .object({
                id: boundedText(4096),
                status: z.enum(['supported', 'refuted']),
                tree: z.literal('practice'),
                source: z
                  .object({
                    agent: z.literal('WorkflowEvidence'),
                    invocation: z.literal(input.invocation),
                    call_id: boundedText(4096),
                  })
                  .strict(),
              })
              .passthrough(),
          })
          .strict(),
      })
      .strict()
      .parse(response);
    const { publication, publication_invocation, ...identity } = parsed;
    const { maximum_distance_squared, field_matches, ...numerical } = publication.assessment;
    const checked = this.parseAssessment(
      { ...identity, assessment: numerical },
      input.assessment,
      recorded
    );
    const matches = Object.fromEntries(
      ['reference_id', 'query_data_id', 'selection', 'selected_count'].map((key) => [
        key,
        !checked.assessment.mismatches.some((m) => m === key),
      ])
    );
    if (
      checked.assessment.status === 'pending' ||
      publication.evidence.status !==
        (checked.assessment.status === 'matched' ? 'supported' : 'refuted') ||
      maximum_distance_squared !== input.assessment.execution.context.maximum ||
      !isEqual(field_matches, matches)
    )
      throw new Error('证据发布与原生验收不一致。');
    return {
      ...identity,
      publication_invocation,
      publication: {
        assessment: { ...checked.assessment, maximum_distance_squared, field_matches: matches },
        evidence: publication.evidence,
      },
    };
  }
  async discuss(raw: WorkflowDiscussionInput, signal: AbortSignal) {
    const input = workflowDiscussionInput.parse(raw);
    return this.parseDiscussion(await this.send('workflow/discuss', input, signal), input);
  }
  parseDiscussion(response: unknown, input: WorkflowDiscussionInput) {
    const parsed = this.identity(input.context)
      .extend({
        discussion: z
          .object({
            answer: boundedText(65536),
            evidence_snapshot: evidenceContext,
            evidence_current: z.boolean(),
            current_evidence: evidenceContext,
            interpretation_only: z.literal(true),
          })
          .strict(),
      })
      .strict()
      .parse(response);
    const {
      evidence_snapshot: used,
      current_evidence: current,
      evidence_current: fresh,
    } = parsed.discussion;
    if (
      !used.applicable ||
      used.status === 'stale' ||
      used.reference_id !== parsed.reference_id ||
      used.query_data_id !== parsed.query_data_id ||
      used.maximum_distance_squared !== input.context.maximum ||
      fresh !== isEqual(used, current)
    )
      throw new Error('讨论结果与证据快照不一致。');
    return parsed;
  }
  async inspectEvidence(
    publication: ReturnType<WorkflowDesignClient['parsePublication']>,
    signal: AbortSignal
  ) {
    const original = structuredClone(publication);
    const input = {
      workspace: original.workspace,
      expected_revision: original.revision,
      claim_id: original.publication.evidence.id,
    };
    return this.parseEvidence(await this.send('workflow/evidence', input, signal), original);
  }
  parseEvidence(
    response: unknown,
    publication: ReturnType<WorkflowDesignClient['parsePublication']>
  ) {
    const original = publication.publication.evidence;
    return z
      .object({
        frontend_notebook_id: z.literal(this.notebookId),
        workspace: z.literal(publication.workspace),
        revision: z.literal(publication.revision),
        claim_id: z.literal(original.id),
        evidence: z
          .object({
            id: z.literal(original.id),
            status: z.enum(['supported', 'refuted', 'stale']),
            tree: z.literal('practice'),
            source: z
              .object({
                agent: z.literal('WorkflowEvidence'),
                invocation: z.literal(original.source.invocation),
                call_id: z.literal(original.source.call_id),
              })
              .strict(),
          })
          .passthrough(),
      })
      .strict()
      .parse(response);
  }
  private executionShape(input: WorkflowExecutionInput) {
    return this.identity(input.context)
      .extend({
        result: z
          .object({
            deployment: boundedText(256),
            fingerprint: z.literal(input.expected_fingerprint),
            execution: outcome,
          })
          .strict(),
      })
      .strict();
  }
}
