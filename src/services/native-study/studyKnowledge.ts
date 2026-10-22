import { z } from 'zod';

const id = z.string().min(1);
const claim = z
  .object({
    id,
    text: z.string(),
    status: z.enum(['candidate', 'supported']),
    source: z.object({ agent: id, invocation: id, call_id: id }).passthrough(),
  })
  .passthrough();

/** Active native projection only; parsing does not prove an assertion or a signature. */
export const studyKnowledge = z
  .object({
    frontend_notebook_id: id,
    workspace: id,
    revision: z.number().int().nonnegative(),
    agent: id,
    context: z
      .object({
        learned: z.record(id, z.record(id, z.array(claim))),
        claim_policy: z.string(),
      })
      .passthrough(),
  })
  .strict();
export type StudyKnowledge = z.infer<typeof studyKnowledge>;

export const studyKnowledgeReport = studyKnowledge
  .omit({ context: true })
  .extend({ report: z.string().min(1) });
export type StudyKnowledgeReport = z.infer<typeof studyKnowledgeReport>;
