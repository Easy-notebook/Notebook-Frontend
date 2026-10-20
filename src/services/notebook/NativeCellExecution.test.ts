import { beforeEach, expect, it, vi } from 'vitest';
import { NativeCellExecution } from './NativeCellExecution';
import { NativeNotebookTransport } from './NativeNotebookTransport';

beforeEach(() => sessionStorage.clear());
function response(body: string, owner = 'book') {
  const request = JSON.parse(body);
  return new Response(
    JSON.stringify({
      frontend_notebook_id: owner,
      cell_id: request.cell_id,
      invocation: request.invocation,
      status: 'ok',
      outputs: [{ type: 'text', content: '42' }],
    })
  );
}
const signal = () => new AbortController().signal;
it('retries the frozen request after transport failure and client recreation', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async (_, init) => response(init!.body as string));
  const transport = new NativeNotebookTransport('book', fetcher);
  await expect(
    new NativeCellExecution('book', 'cell', sessionStorage, transport).execute('source', signal())
  ).rejects.toThrow('offline');
  const result = await new NativeCellExecution('book', 'cell', sessionStorage, transport).execute(
    'source',
    signal()
  );
  expect(result.status).toBe('ok');
  expect(fetcher.mock.calls[0][1]!.body).toBe(fetcher.mock.calls[1][1]!.body);
  expect(sessionStorage.length).toBe(0);
});
it('rejects foreign results and retains the pending request', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_, init) => response(init!.body as string, 'other'));
  const client = new NativeCellExecution(
    'book',
    'cell',
    sessionStorage,
    new NativeNotebookTransport('book', fetcher)
  );
  await expect(client.execute('source', signal())).rejects.toThrow('identity mismatch');
  expect(sessionStorage.length).toBe(1);
});
it('does not dispatch if the request cannot be tracked or exceeds the source limit', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  } as unknown as Storage;
  const client = new NativeCellExecution(
    'book',
    'cell',
    storage,
    new NativeNotebookTransport('book', fetcher)
  );
  await expect(client.execute('source', signal())).rejects.toThrow('quota');
  await expect(client.execute('x'.repeat(32769), signal())).rejects.toThrow('32 KiB');
  expect(fetcher).not.toHaveBeenCalled();
});
it('cannot clear a newer request when a disposed execution completes late', async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    )
    .mockRejectedValueOnce(new Error('offline'));
  const client = new NativeCellExecution(
    'book',
    'cell',
    sessionStorage,
    new NativeNotebookTransport('book', fetcher)
  );
  const controller = new AbortController();
  const first = client.execute('first', controller.signal);
  controller.abort();
  await expect(client.execute('second', signal())).rejects.toThrow('offline');
  resolve(response(fetcher.mock.calls[0][1]!.body as string));
  await expect(first).rejects.toThrow();
  expect(sessionStorage.getItem(sessionStorage.key(0)!)).toContain('second');
});
