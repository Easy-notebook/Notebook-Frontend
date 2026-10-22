import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
const selectionSchema = z
  .object({
    source: z.string(),
    location: z.string(),
    content_hash: z.string(),
    model_path: z.string(),
    reference: z.object({ path: z.string(), expected_id: z.string() }).strict().nullable(),
  })
  .strict();
export type ReviewSelection = z.infer<typeof selectionSchema>;
const previewSchema = z
  .object({
    artifact_fingerprint: z.string().min(1),
    selection: selectionSchema,
    tools: z
      .array(
        z
          .object({
            name: z.enum(['profile', 'assign', 'similar']),
            description: z.string(),
            operation: z.string(),
            parameters: z.unknown(),
            result: z.unknown(),
            binding: z
              .object({
                positional: z.array(z.unknown()),
                named: z.record(z.string(), z.unknown()),
              })
              .strict(),
          })
          .strict()
      )
      .min(0)
      .max(3),
  })
  .strict();
/** A preview is inspection, never a durable tool grant or an execution request. */
export class SkillReviewClient {
  constructor(private readonly notebookId: string) {}
  async inspect(
    workspace: string,
    revision: number,
    lock: unknown,
    selection: ReviewSelection,
    signal: AbortSignal
  ) {
    const expected = selectionSchema.parse(selection);
    const response = z
      .object({
        frontend_notebook_id: z.literal(this.notebookId),
        workspace: z.literal(workspace),
        revision: z.literal(revision),
        execution_authorized: z.literal(false),
        preview: previewSchema,
      })
      .strict()
      .parse(
        await new NativeNotebookTransport(this.notebookId).send(
          'skill-review/preview',
          {
            workspace,
            expected_revision: revision,
            lock,
            selection: expected,
          },
          signal
        )
      );
    if (JSON.stringify(response.preview.selection) !== JSON.stringify(expected)) {
      throw new Error('技能预览与所选资源不一致。');
    }
    return response.preview;
  }
}
