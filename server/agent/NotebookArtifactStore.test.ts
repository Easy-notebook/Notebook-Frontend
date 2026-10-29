import { afterEach, it, expect, vi } from 'vitest';
import { NotebookArtifactStore } from './NotebookArtifactStore';
afterEach(() => vi.unstubAllGlobals());
it('exports exclusively into AAL output with no filesystem path selected by caller', async () => {
  const request = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ receipt: { revision: 2 } })))
    );
  vi.stubGlobal('fetch', request);
  const store = new NotebookArtifactStore();
  const content = JSON.stringify({ notebook_id: 'n', cells: [] });
  const result = await store.execute('write', { notebookId: 'n', label: '../escape', content });
  expect(result.path).toMatch(/^\/output\/[a-f0-9-]+\.easynb$/);
  expect(JSON.parse(request.mock.calls[0][1].body).operation).toEqual({
    op: 'create',
    path: result.path,
    content,
  });
  await expect(
    store.execute('write', { notebookId: 'other', label: 'bad', content })
  ).rejects.toThrow('identity');
  await expect(store.execute('read', { notebookId: 'n', fileId: '../escape' })).rejects.toThrow();
});
