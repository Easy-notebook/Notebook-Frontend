import { afterEach, expect, it, vi } from 'vitest';
import { NotebookVersionHistory } from './NotebookVersionHistory';
import { NativeWorkspaceFiles } from './NativeWorkspaceFiles';
afterEach(() => vi.unstubAllGlobals());
it('uses independent history identities and restores through AAL without requesting replacement', async () => {
  const version = {
    id: 'a'.repeat(64),
    name: 'original.easynb',
    kind: 'original' as const,
    revision: 1,
    size: 2,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ versions: [version] })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 1, size: 2, content: '{}', nextOffset: null }))
    )
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const history = new NotebookVersionHistory('owner');
  expect(await history.list()).toEqual([version]);
  expect(await history.read(version.id)).toBe('{}');
  await history.restore(version, '/recovered.easynb');
  expect(fetcher.mock.calls.map((c) => JSON.parse(c[1].body))).toMatchObject([
    { action: 'history', id: null },
    { action: 'history', id: version.id, offset: 0 },
    { action: 'restore_version', id: version.id, destination: '/recovered.easynb', revision: 1 },
  ]);
});
it('keeps user-created Data/Originals/Backups names as ordinary working paths', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            path: '/Data/notes.md',
            revision: 1,
            size: 2,
            content: 'ok',
            nextOffset: null,
          })
        )
      )
    );
  vi.stubGlobal('fetch', fetcher);
  expect((await new NativeWorkspaceFiles('owner', 'product').read('/Data/notes.md')).content).toBe(
    'ok'
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    action: 'product',
    operation: { op: 'read', path: '/Data/notes.md' },
  });
});
