import { afterEach, expect, it, vi } from 'vitest';
import { NotebookFileCommands } from './NotebookFileCommands';
afterEach(() => vi.unstubAllGlobals());
it('uses product operations and a catalog revision for an atomic native move', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ receipt: {} }))));
  vi.stubGlobal('fetch', fetcher);
  const commands = new NotebookFileCommands('owner');
  await commands.create('/notes', true);
  await commands.create('/notes/a.md', false);
  await commands.move('/notes', '/archive', 12);
  expect(fetcher.mock.calls.map((call) => JSON.parse(call[1].body))).toMatchObject([
    { action: 'product', operation: { op: 'mkdir', path: '/notes' } },
    { action: 'product', operation: { op: 'create', path: '/notes/a.md', content: '' } },
    {
      action: 'product',
      operation: { op: 'move', source: '/notes', destination: '/archive', revision: 12 },
    },
  ]);
});
it('rejects missing revisions and invalid names without sending a mutation', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const name of ['..', 'a/b', 'a\\b', ' ', ' a', 'a\n'])
    expect(() => NotebookFileCommands.child('/', name)).toThrow();
  expect(() => new NotebookFileCommands('owner').move('/a', '/b', undefined)).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(NotebookFileCommands.child('/notes', '分析.md')).toBe('/notes/分析.md');
});
