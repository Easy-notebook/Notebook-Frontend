import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import { parseStudyModel } from './studyModel';
const packagedModel = z
  .object({
    skill: z.string(),
    source: z.string(),
    location: z.string(),
    content_hash: z.string(),
    path: z.string(),
    model: z.unknown(),
  })
  .strict();
export type SkillModel = z.infer<typeof packagedModel>;
/** The native service owns lock, resource-hash and binary-model validation. */
export class SkillModelClient {
  constructor(private readonly notebookId: string) {}
  async inspect(lock: unknown, signal: AbortSignal): Promise<SkillModel[]> {
    const response = z
      .object({
        frontend_notebook_id: z.literal(this.notebookId),
        models: z.array(packagedModel).min(1).max(64),
      })
      .strict()
      .parse(
        await new NativeNotebookTransport(this.notebookId).send(
          'model-file/skill-lock',
          { lock },
          signal
        )
      );
    return response.models.map((entry) => ({
      ...entry,
      model: parseStudyModel(JSON.stringify(entry.model)),
    }));
  }
}
