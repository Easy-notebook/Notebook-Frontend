import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { toolNameSchema, toolsForRole } from '../../../src/services/agent-cell/protocol';
import type { ProviderRun } from '../providers/types';

export const notebookSourcePath = fileURLToPath(new URL('../aal/notebook.aal', import.meta.url));
export const notebookSkillPath = fileURLToPath(new URL('./notebook/SKILL.md', import.meta.url));
export const notebookSkillSchema = z
  .object({
    name: z.literal('notebook'),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    document: z.string().min(1).max(65_536),
    body: z.string().min(1).max(65_536),
    allowedTools: z.array(toolNameSchema).min(1).readonly(),
  })
  .strict();
export type NotebookSkill = z.infer<typeof notebookSkillSchema>;

/** Accept only the frozen resource loaded by the native AAL import, matching this deployment. */
export function acceptNotebookSkill(input: unknown): NotebookSkill {
  const skill = notebookSkillSchema.parse(input);
  const document = readFileSync(notebookSkillPath, 'utf8');
  const hash = 'sha256:' + createHash('sha256').update(document).digest('hex');
  if (skill.document !== document || skill.contentHash !== hash)
    throw new Error('Notebook skill deployment mismatch: rebuild the AAL package');
  return Object.freeze(skill);
}

export function notebookTools(run: ProviderRun) {
  if (!run.notebookSkill) throw new Error('Notebook skill was not loaded by AAL');
  const allowed = new Set(run.notebookSkill.allowedTools);
  return Object.fromEntries(
    Object.entries(toolsForRole(run.role)).filter(([name]) =>
      allowed.has(toolNameSchema.parse(name))
    )
  );
}
export function notebookInstructions(run: ProviderRun) {
  notebookTools(run);
  return `${run.notebookSkill!.body}\n\nHost-assigned role: ${run.role ?? 'worker'}. Follow only that role's workflow and exposed tools.`;
}
