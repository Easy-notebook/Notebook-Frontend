import { create } from 'zustand';
import { z } from 'zod';
import { NativeNotebookError, NativeNotebookTransport } from '../notebook/NativeNotebookTransport';
export const notebookAgentSchema = z.object({
  notebookId: z.string(),
  agentId: z.string().min(1),
  className: z.string().min(1),
  name: z.string().min(1).max(80),
  logo: z.string().min(1).max(131072),
  provider: z.enum(['codex', 'claude']),
  source: z
    .object({
      provider: z.enum(['codex', 'claude']),
      sessionId: z.string().uuid(),
      cwd: z.string(),
    })
    .nullable()
    .optional(),
  revision: z.number().int().nonnegative(),
});
export type NotebookAgentIdentity = z.infer<typeof notebookAgentSchema>;
type Entry = { identity?: NotebookAgentIdentity; error?: string };
export const useNotebookAgentProfiles = create<{ entries: Record<string, Entry> }>(() => ({
  entries: {},
}));
class NotebookAgentProfiles {
  private pending = new Map<string, Promise<NotebookAgentIdentity>>();
  private publish(id: string, entry: Entry) {
    useNotebookAgentProfiles.setState((s) => {
      const previous = s.entries[id];
      if (
        entry.identity &&
        previous?.identity &&
        entry.identity.revision < previous.identity.revision
      )
        return s;
      return { entries: { ...s.entries, [id]: entry } };
    });
  }
  async load(id: string): Promise<NotebookAgentIdentity> {
    const current = this.pending.get(id);
    if (current) return current;
    const request = this.read(id);
    this.pending.set(id, request);
    try {
      return await request;
    } finally {
      this.pending.delete(id);
    }
  }
  private async read(id: string) {
    try {
      const transport = new NativeNotebookTransport(id);
      let value: unknown;
      for (let attempt = 0; ; attempt++) {
        try {
          value = await transport.send('agent');
          break;
        } catch (error) {
          // Reads contend with short notebook transactions. Bound retries; never retry mutations.
          if (!(error instanceof NativeNotebookError) || error.code !== 'E_BUSY' || attempt >= 3)
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
        }
      }
      const identity = this.validate(id, value);
      this.publish(id, { identity });
      return identity;
    } catch (error) {
      this.publish(id, {
        identity: useNotebookAgentProfiles.getState().entries[id]?.identity,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  private validate(id: string, value: unknown) {
    const identity = notebookAgentSchema.parse(value);
    if (identity.notebookId !== id) throw new Error('Notebook Agent ownership mismatch');
    return identity;
  }
  async save(
    profile: NotebookAgentIdentity,
    values: Pick<NotebookAgentIdentity, 'name' | 'logo' | 'provider'>
  ) {
    // Serialize a prior read so its stale response cannot replace the saved profile.
    await this.pending.get(profile.notebookId);
    const identity = this.validate(
      profile.notebookId,
      await new NativeNotebookTransport(profile.notebookId).send('agent', {
        ...values,
        revision: profile.revision,
      })
    );
    this.publish(profile.notebookId, { identity });
    return identity;
  }
}
export const notebookAgentProfiles = new NotebookAgentProfiles();
