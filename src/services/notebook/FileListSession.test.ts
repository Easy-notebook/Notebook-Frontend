import { expect, it, vi } from 'vitest';
import { FileListSession } from './FileListSession';
import { FileService } from './FileService';
import type { FileListResponse } from '../types';

function pending() {
  let resolve!: (response: FileListResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<FileListResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const listing = (name: string): FileListResponse => ({
  status: 'ok',
  files: [{ name, type: 'file', size: 1 }],
});

it.each(['resolve', 'reject'] as const)(
  'ignores an obsolete refresh that later %ss',
  async (settle) => {
    const first = pending();
    const second = pending();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const session = new FileListSession('owner', load);
    session.attach();
    const old = session.refresh();
    const oldSignal = load.mock.calls[0][1] as AbortSignal;
    const current = session.refresh();
    expect(oldSignal.aborted).toBe(true);
    if (settle === 'resolve') first.resolve(listing('old'));
    else first.reject(new Error('old failure'));
    await old;
    expect(session.getSnapshot()).toEqual({ status: 'loading', files: [] });
    second.resolve(listing('new'));
    await current;
    expect(session.getSnapshot()).toMatchObject({ status: 'ready', files: [{ name: 'new' }] });
  }
);

it('revokes detached work and stale starts, then supports reattachment', async () => {
  const first = pending();
  const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(listing('new'));
  const session = new FileListSession('owner', load);
  session.attach();
  const old = session.refresh();
  session.detach();
  const notify = vi.fn();
  session.subscribe(notify);
  first.resolve(listing('old'));
  await old;
  await session.refresh();
  expect(notify).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledOnce();
  session.attach();
  await session.refresh();
  expect(session.getSnapshot()).toMatchObject({ status: 'ready', files: [{ name: 'new' }] });
});

it('retains files during refresh, clears on current failure, and recovers on retry', async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce(listing('old'))
    .mockResolvedValueOnce({ status: 'error', message: 'offline' })
    .mockResolvedValueOnce(listing('new'));
  const session = new FileListSession('owner', load);
  session.attach();
  await session.refresh();
  const refresh = session.refresh();
  expect(session.getSnapshot()).toMatchObject({ status: 'loading', files: [{ name: 'old' }] });
  await refresh;
  expect(session.getSnapshot()).toEqual({ status: 'error', files: [], error: 'offline' });
  await session.refresh();
  expect(session.getSnapshot()).toMatchObject({ status: 'ready', files: [{ name: 'new' }] });
});

it('does not start a transport when a loading subscriber detaches the session', async () => {
  const load = vi.fn();
  const session = new FileListSession('owner', load);
  session.attach();
  session.subscribe(() => session.detach());
  await session.refresh();
  expect(load).not.toHaveBeenCalled();
});

it('normalizes directory children and leaves an omitted successful list empty', async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce({
      status: 'ok',
      files: [
        {
          name: 'assets',
          type: 'directory',
          children: [{ name: 'a.txt', type: 'text/plain', size: 3, path: 'assets/a.txt' }],
        },
      ],
    })
    .mockResolvedValueOnce({ status: 'ok' });
  const session = new FileListSession('owner', load);
  session.attach();
  await session.refresh();
  expect(session.getSnapshot()).toEqual({
    status: 'ready',
    files: [
      {
        name: 'assets',
        path: 'assets',
        type: 'directory',
        children: [{ name: 'a.txt', path: 'assets/a.txt', type: 'file', size: 3, lastModified: 0 }],
      },
    ],
  });
  await session.refresh();
  expect(session.getSnapshot()).toEqual({ status: 'ready', files: [] });
});

it('passes cancellation through the real list transport', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ status: 'ok', files: [] })));
  try {
    const controller = new AbortController();
    await FileService.listFiles('owner', controller.signal);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/list_files/owner'), {
      method: 'GET',
      signal: controller.signal,
    });
  } finally {
    fetcher.mockRestore();
  }
});
