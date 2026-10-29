import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  state: { notebookId: 'n', notebookTitle: 'Title', cells: [], tasks: [] },
  listener: undefined as undefined | ((s: any, p: any) => void),
  unsubscribe: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => fixture.state,
    subscribe: (fn: any) => {
      fixture.listener = fn;
      return fixture.unsubscribe;
    },
  },
}));
import { NotebookFileSync } from './NotebookFileSync';
import { NativeWorkspaceFiles } from './NativeWorkspaceFiles';
const response = (revision: number) => ({
  unchanged: false as const,
  revision,
  reset: true,
  entries: [{ path: '/work/notebook.easynb', revision, size: 1, writable: true, removable: true }],
  removed: [],
});
beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  fixture.state = { notebookId: 'n', notebookTitle: 'Title', cells: [], tasks: [] };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('coalesces edits and sends the last acknowledged working revision', async () => {
  const sync = vi
    .spyOn(NativeWorkspaceFiles.prototype, 'sync')
    .mockResolvedValueOnce(response(2))
    .mockResolvedValue(response(3));
  const changed = vi.fn();
  const session = new NotebookFileSync('n', changed, vi.fn());
  await session.start();
  for (const title of ['a', 'b', 'c']) {
    const old = fixture.state;
    fixture.state = { ...old, notebookTitle: title };
    fixture.listener!(fixture.state, old);
  }
  await vi.advanceTimersByTimeAsync(750);
  expect(sync).toHaveBeenCalledTimes(2);
  expect(sync.mock.calls[1][1]).toBe(2);
  expect(JSON.parse(sync.mock.calls[1][0]).title).toBe('c');
  expect(changed).toHaveBeenCalledTimes(2);
  session.stop();
  expect(fixture.unsubscribe).toHaveBeenCalled();
});
it('reports a conflict without adopting a new revision or retrying against it', async () => {
  sessionStorage.setItem('aal-files-revision:n', '7');
  const sync = vi
    .spyOn(NativeWorkspaceFiles.prototype, 'sync')
    .mockRejectedValue(new Error('file revision changed'));
  const failed = vi.fn();
  const changed = vi.fn();
  const session = new NotebookFileSync('n', changed, failed);
  await session.start();
  expect(sync.mock.calls[0][1]).toBe(7);
  expect(failed).toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('aal-files-revision:n')).toBe('7');
  session.stop();
});
it('aborts its request on disposal and does not notify a different workspace', async () => {
  let resolve!: (value: any) => void;
  const sync = vi
    .spyOn(NativeWorkspaceFiles.prototype, 'sync')
    .mockImplementation(() => new Promise((done) => (resolve = done)));
  const changed = vi.fn();
  const session = new NotebookFileSync('n', changed, vi.fn());
  const pending = session.start();
  session.stop();
  expect(sync.mock.calls[0][2]?.aborted).toBe(true);
  resolve(response(2));
  await pending;
  expect(changed).not.toHaveBeenCalled();
});
