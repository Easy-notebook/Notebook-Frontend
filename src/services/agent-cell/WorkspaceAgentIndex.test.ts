import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspaceAgentIndex } from './WorkspaceAgentIndex';
afterEach(() => vi.unstubAllGlobals());
describe('deployed workspace agent index', () => {
  it('reads the scoped native catalog, retaining custom definitions', async () => {
    const data = {
      entry: 'Custom',
      artifactVersion: 1,
      agents: [
        {
          className: 'Custom',
          contractOnly: false,
          role: null,
          abilities: [],
          memory: [],
          skills: [],
          permissions: null,
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(await loadWorkspaceAgentIndex('workspace-1', controller.signal)).toEqual(data);
    expect(fetcher).toHaveBeenCalledWith(
      '/aal-api/workspaces/workspace-1/agents',
      expect.objectContaining({ method: 'GET', signal: controller.signal })
    );
  });
  it('rejects an invalid catalog instead of manufacturing default agents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ agents: [] }))));
    await expect(
      loadWorkspaceAgentIndex('workspace-1', new AbortController().signal)
    ).rejects.toThrow();
  });
  it('surfaces a scoped native error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'Workspace unavailable' } }), {
            status: 403,
          })
        )
    );
    await expect(
      loadWorkspaceAgentIndex('workspace-1', new AbortController().signal)
    ).rejects.toThrow('Workspace unavailable');
  });
});
