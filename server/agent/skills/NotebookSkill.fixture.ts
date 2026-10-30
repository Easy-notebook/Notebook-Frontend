/** Test-only transport fixture; production skill documents are parsed by the AAL compiler. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { acceptNotebookSkill, notebookSkillPath } from './NotebookSkill';
export function notebookSkillFixture() {
  const document = readFileSync(notebookSkillPath, 'utf8');
  const body = document.split('\n---\n')[1].trim();
  const allowedTools = document.match(/^allowed-tools: \[(.*)\]$/m)![1].split(', ');
  return acceptNotebookSkill({
    name: 'notebook',
    contentHash: 'sha256:' + createHash('sha256').update(document).digest('hex'),
    document,
    body,
    allowedTools,
  });
}
