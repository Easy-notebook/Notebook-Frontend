import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
const owner = z.string().min(1).max(200);
/** Notebook exports are create-only files in the same native AAL workspace as the explorer. */
export class NotebookArtifactStore {
  constructor(
    private readonly target = process.env.AAL_NOTEBOOK_TARGET || 'http://127.0.0.1:8787'
  ) {}
  private async request(
    notebookId: string,
    route: 'files' | 'agent',
    body?: unknown
  ): Promise<any> {
    const target = new URL(this.target);
    if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname))
      throw new Error('Native AAL must be loopback');
    const response = await fetch(
      new URL(`/api/workspaces/${encodeURIComponent(notebookId)}/${route}`, target),
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      }
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || 'AAL request failed');
    return value;
  }
  async readAgent(notebookId: string) {
    const value = await this.request(notebookId, 'agent');
    const profile = z
      .object({
        notebookId: z.string(),
        agentId: z.string(),
        name: z.string(),
        provider: z.enum(['codex', 'claude']),
        className: z.string(),
      })
      .parse(value);
    if (profile.notebookId !== notebookId) throw new Error('Notebook agent ownership mismatch');
    return profile;
  }
  private executeFile(notebookId: string, operation: unknown) {
    return this.request(notebookId, 'files', {
      action: 'execute',
      operation,
      request_id: randomUUID(),
    });
  }
  async execute(operation: string, input: unknown) {
    if (operation === 'write') {
      const { notebookId, content, label } = z
        .object({
          notebookId: owner,
          content: z.string().max(2 * 1024 * 1024),
          label: z.string().min(1).max(100),
        })
        .strict()
        .parse(input);
      const document = JSON.parse(content);
      if (document.notebook_id !== notebookId || !Array.isArray(document.cells))
        throw new Error('Artifact notebook identity mismatch');
      const fileId = randomUUID(),
        path = `/output/${fileId}.easynb`;
      await this.executeFile(notebookId, { op: 'create', path, content });
      return {
        fileId,
        path,
        label,
        size: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    }
    if (operation === 'list') {
      const { notebookId } = z.object({ notebookId: owner }).strict().parse(input);
      const result = await this.executeFile(notebookId, { op: 'catalog', since: null });
      return result.entries
        .filter((entry: any) => /^\/output\/[a-f0-9-]{36}\.easynb$/.test(entry.path))
        .map((entry: any) => ({ ...entry, fileId: entry.path.split('/').pop().slice(0, -7) }));
    }
    if (operation === 'read') {
      const { notebookId, fileId, offset } = z
        .object({
          notebookId: owner,
          fileId: z.string().uuid(),
          offset: z.number().int().nonnegative().default(0),
        })
        .strict()
        .parse(input);
      const path = `/output/${fileId}.easynb`;
      return {
        fileId,
        ...(await this.executeFile(notebookId, { op: 'read', path, offset, limit: 60000 })),
      };
    }
    throw new Error('Unknown notebook artifact operation');
  }
}
