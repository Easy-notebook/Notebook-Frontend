import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import { selectionSchema, previewSchema } from './SkillReviewClient';
export const reviewInput = z
  .object({
    workspace: z.string().min(1).max(256),
    revision: z.number().int().nonnegative(),
    invocation: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    csv: z
      .string()
      .min(1)
      .refine((s) => new TextEncoder().encode(s).length <= 32768),
    lock: z
      .object({ version: z.literal(1), skills: z.array(z.unknown()).min(1).max(64) })
      .passthrough(),
    selection: selectionSchema,
  })
  .strict();
export type ReviewInput = z.infer<typeof reviewInput>;
export const approvalSchema = z
  .object({
    id: z.string(),
    scope: z.string(),
    action: z
      .object({
        kind: z.literal('agent'),
        request: z
          .object({
            caller: z.string(),
            callee: z.string(),
            ability: z.literal('run'),
            invocation: z.string(),
            call_id: z.literal('housing-review-root'),
            arguments: z
              .object({ csv: z.object({ kind: z.literal('String'), value: z.string() }).strict() })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    state: z.discriminatedUnion('status', [
      z.object({ status: z.literal('pending') }).strict(),
      z.object({ status: z.literal('approved'), actor: z.string(), reason: z.string() }).strict(),
      z.object({ status: z.literal('denied'), actor: z.string(), reason: z.string() }).strict(),
    ]),
  })
  .strict();
export type ReviewApproval = z.infer<typeof approvalSchema>;
export const decision = (approve: boolean) => ({
  approve,
  actor: 'notebook-browser',
  reason: approve
    ? 'User approved this exact frozen housing review.'
    : 'User denied this exact frozen housing review.',
});
export class SkillReviewExecutionClient {
  constructor(readonly notebookId: string) {}
  private async send(
    route: 'request' | 'decision' | 'execute',
    input: ReviewInput,
    signal: AbortSignal,
    approve?: boolean
  ) {
    return z
      .object({
        frontend_notebook_id: z.literal(this.notebookId),
        workspace: z.literal(input.workspace),
        revision: z.literal(input.revision),
        invocation: z.literal(input.invocation),
        payload: z.unknown(),
      })
      .strict()
      .parse(
        await new NativeNotebookTransport(this.notebookId).send(
          `skill-review/${route}`,
          route === 'decision' ? { input, ...decision(approve!) } : input,
          signal
        )
      ).payload;
  }
  private checked(approval: ReviewApproval, input: ReviewInput) {
    const call = approval.action.request;
    if (
      call.invocation !== input.invocation ||
      call.arguments.csv.value !== input.csv ||
      call.caller !== call.callee
    ) {
      throw new Error('技能审批与冻结调用输入不一致。');
    }
    return approval;
  }
  async request(input: ReviewInput, signal: AbortSignal) {
    const result = z
      .object({ approval: approvalSchema, preview: previewSchema })
      .strict()
      .parse(await this.send('request', input, signal));
    if (JSON.stringify(result.preview.selection) !== JSON.stringify(input.selection))
      throw new Error('技能审批预览与所选资源不一致。');
    return { approval: this.checked(result.approval, input), preview: result.preview };
  }
  async decide(input: ReviewInput, approve: boolean, signal: AbortSignal) {
    const result = z
      .object({ approval: approvalSchema })
      .strict()
      .parse(await this.send('decision', input, signal, approve));
    const expected = decision(approve);
    const state = result.approval.state;
    if (
      state.status !== (approve ? 'approved' : 'denied') ||
      !('actor' in state) ||
      state.actor !== expected.actor ||
      state.reason !== expected.reason
    )
      throw new Error('服务器审批决策与本次选择不一致。');
    return this.checked(result.approval, input);
  }
  async execute(input: ReviewInput, signal: AbortSignal) {
    return z
      .object({ result: z.string() })
      .strict()
      .parse(await this.send('execute', input, signal)).result;
  }
}
