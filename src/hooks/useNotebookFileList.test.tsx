import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FileService } from '@Services/notebook/FileService';
import type { FileListResponse } from '@Services/types';
import { useNotebookFileList } from './useNotebookFileList';
afterEach(() => vi.restoreAllMocks());

it('isolates notebook snapshots and rejects stale refreshes after switching or unmounting', async () => {
  const requests: {
    id: string;
    signal: AbortSignal | undefined;
    resolve: (data: FileListResponse) => void;
  }[] = [];
  const load = vi.spyOn(FileService, 'listFiles').mockImplementation(
    (id, signal) =>
      new Promise((resolve) => {
        requests.push({ id, signal, resolve });
      })
  );
  const hook = renderHook(({ id }) => useNotebookFileList(id), { initialProps: { id: 'a' } });
  const oldRefresh = hook.result.current.refresh;
  hook.rerender({ id: 'b' });
  expect(requests[0].signal?.aborted).toBe(true);
  expect(hook.result.current.state).toEqual({ status: 'loading', files: [] });
  await act(async () => {
    requests[1].resolve({ status: 'ok', files: [{ name: 'b.txt', type: 'file', size: 1 }] });
  });
  await act(async () => {
    requests[0].resolve({ status: 'ok', files: [{ name: 'a.txt', type: 'file', size: 1 }] });
    await oldRefresh();
  });
  expect(hook.result.current.state).toMatchObject({ status: 'ready', files: [{ name: 'b.txt' }] });
  expect(load).toHaveBeenCalledTimes(2);
  const currentRefresh = hook.result.current.refresh;
  hook.unmount();
  await currentRefresh();
  expect(load).toHaveBeenCalledTimes(2);
});

it('survives StrictMode effect replay and does not reload on an ordinary rerender', async () => {
  const load = vi.spyOn(FileService, 'listFiles').mockResolvedValue({ status: 'ok', files: [] });
  const hook = renderHook(() => useNotebookFileList('owner'), { wrapper: StrictMode });
  await act(async () => {});
  expect(hook.result.current.state).toEqual({ status: 'ready', files: [] });
  expect(load.mock.calls[0][1]?.aborted).toBe(true);
  const count = load.mock.calls.length;
  hook.rerender();
  expect(load).toHaveBeenCalledTimes(count);
  hook.unmount();
});
