import { z } from 'zod';
import { NativeNotebookTransport } from '../notebook/NativeNotebookTransport';
const field = z.object({ name: z.string(), type: z.string() });
export const workspaceAgentIndexSchema = z.object({
  entry: z.string(),
  artifactVersion: z.number(),
  agents: z.array(
    z.object({
      className: z.string(),
      contractOnly: z.boolean(),
      role: z.string().nullable(),
      abilities: z.array(
        z.object({
          name: z.string(),
          parameters: z.array(field),
          result: z.string(),
          effects: z.array(z.string()),
        })
      ),
      memory: z.array(field),
      skills: z.array(z.string()),
      permissions: z.unknown(),
    })
  ),
});
export type WorkspaceAgentIndex = z.infer<typeof workspaceAgentIndexSchema>;
export async function loadWorkspaceAgentIndex(notebookId: string, signal: AbortSignal) {
  return workspaceAgentIndexSchema.parse(
    await new NativeNotebookTransport(notebookId).send('agents', undefined, signal)
  );
}
