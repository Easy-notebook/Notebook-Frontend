import { afterEach, expect, it, vi } from 'vitest';
import { notebookAgentProfiles, useNotebookAgentProfiles } from './NotebookAgentIdentity';
const profile = {
  notebookId: 'test',
  agentId: 'notebook:test:Custom',
  className: 'Custom',
  name: 'Research',
  logo: '🔬',
  provider: 'codex',
  revision: 1,
};
afterEach(() => {
  vi.unstubAllGlobals();
  useNotebookAgentProfiles.setState({ entries: {} });
});
it('retries a busy read and resolves the real notebook identity', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'E_BUSY', message: 'busy' } }), { status: 409 })
    )
    .mockResolvedValue(new Response(JSON.stringify(profile)));
  vi.stubGlobal('fetch', request);
  expect(await notebookAgentProfiles.load('test')).toEqual(profile);
  expect(request).toHaveBeenCalledTimes(2);
});
it('retains the last identity on a failed refresh and does not retry non-busy errors', async () => {
  useNotebookAgentProfiles.setState({ entries: { test: { identity: profile as never } } });
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'E_STORE', message: 'unavailable' } }), {
        status: 500,
      })
    );
  vi.stubGlobal('fetch', request);
  await expect(notebookAgentProfiles.load('test')).rejects.toThrow('unavailable');
  expect(request).toHaveBeenCalledTimes(1);
  expect(useNotebookAgentProfiles.getState().entries.test.identity).toEqual(profile);
});
