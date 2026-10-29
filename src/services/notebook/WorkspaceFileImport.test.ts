import { expect, it, vi, afterEach } from 'vitest';
import { WorkspaceFileImport } from './WorkspaceFileImport';
const file = (name: string, text: string) =>
  ({
    name,
    size: new TextEncoder().encode(text).length,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }) as File;
afterEach(() => vi.unstubAllGlobals());
it('imports to the chosen working folder through AAL and never creates dataset partitions', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const progress = vi.fn();
  await new WorkspaceFileImport().uploadFiles(
    'owner',
    [file('notes.md', '# Notes')],
    { targetDir: '/research', mode: 'restricted', allowedTypes: ['.md'], maxFileSize: 2048 },
    progress,
    new AbortController().signal
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    action: 'product',
    operation: { op: 'create', path: '/research/notes.md', content: '# Notes' },
  });
  expect(progress).toHaveBeenCalledOnce();
});
it('rejects unsupported binary or oversized data before any mutation', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const importer = new WorkspaceFileImport();
  const config = { mode: 'restricted' as const, allowedTypes: [], maxFileSize: 1024 };
  await expect(
    importer.uploadFiles(
      'owner',
      [file('bad', 'x\0')],
      config,
      vi.fn(),
      new AbortController().signal
    )
  ).rejects.toThrow('UTF-8');
  await expect(
    importer.uploadFiles(
      'owner',
      [file('big', 'x'.repeat(1025))],
      config,
      vi.fn(),
      new AbortController().signal
    )
  ).rejects.toThrow('2 MiB');
  expect(fetcher).not.toHaveBeenCalled();
});
