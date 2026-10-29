import { afterEach, expect, it, vi } from 'vitest';
import { NativeWorkspaceFiles } from './NativeWorkspaceFiles';
afterEach(() => vi.unstubAllGlobals());
it('uses native revision cursors and returns no fabricated notebook entry', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ revision: 9, unchanged: true })));
  vi.stubGlobal('fetch', request);
  expect(await new NativeWorkspaceFiles('owner').list(undefined, 9)).toEqual({
    status: 'ok',
    revision: 9,
    unchanged: true,
  });
  expect(JSON.parse(request.mock.calls[0][1].body).operation).toEqual({ op: 'catalog', since: 9 });
  expect(request.mock.calls[0][0]).toBe('/aal-api/workspaces/owner/files');
});
it('refuses mixed revisions while reading full contents', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ path: '/work/a', revision: 1, size: 8, content: 'one', nextOffset: 3 })
      )
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ path: '/work/a', revision: 2, size: 8, content: 'two', nextOffset: null })
      )
    );
  vi.stubGlobal('fetch', request);
  await expect(new NativeWorkspaceFiles('owner').read('/work/a')).rejects.toThrow('changed');
});
it('rejects non-virtual paths before transport', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  await expect(new NativeWorkspaceFiles('owner').read('file:///etc/passwd')).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
