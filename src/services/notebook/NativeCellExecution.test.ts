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
function retained(body: string) {
  const request = JSON.parse(body);
  return response(body)
    .json()
    .then(
      (result) =>
        new Response(
          JSON.stringify({
            frontend_notebook_id: 'book',
            cell_id: request.cell_id,
            invocation: request.invocation,
            status: 'completed',
            result,
          })
        )
    );
}
const signal = () => new AbortController().signal;
it('retries the frozen request after transport failure and client recreation', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async (_, init) => retained(init!.body as string));
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
  expect(String(fetcher.mock.calls[1][0])).toMatch(/executions\/lookup$/);
  expect(sessionStorage.length).toBe(0);
});

it('does not submit execution when result lookup fails', async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
  const client = new NativeCellExecution(
    'book',
    'cell',
    sessionStorage,
    new NativeNotebookTransport('book', fetcher)
  );
  await expect(client.execute('source', signal())).rejects.toThrow('offline');
  const frozen = sessionStorage.getItem(sessionStorage.key(0)!);
  await expect(client.execute('source', signal())).rejects.toThrow('offline');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String(fetcher.mock.calls[1][0])).toMatch(/executions\/lookup$/);
  expect(sessionStorage.getItem(sessionStorage.key(0)!)).toBe(frozen);
});

it.each(['envelope', 'result', 'pending'] as const)(
  'rejects invalid %s lookup without dispatch or clearing the request',
  async (change) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('lost'))
      .mockImplementationOnce(async (_, init) => {
        const value = await (await retained(init!.body as string)).json();
        if (change === 'envelope') value.frontend_notebook_id = 'foreign';
        if (change === 'result') value.result.cell_id = 'foreign';
        if (change === 'pending') value.result.status = 'pending';
        return new Response(JSON.stringify(value));
      });
    const client = new NativeCellExecution(
      'book',
      'cell',
      sessionStorage,
      new NativeNotebookTransport('book', fetcher)
    );
    await expect(client.execute('source', signal())).rejects.toThrow('lost');
    const frozen = sessionStorage.getItem(sessionStorage.key(0)!);
    await expect(client.execute('source', signal())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(sessionStorage.key(0)!)).toBe(frozen);
  }
);

it('recovers a retained terminal error without rerunning the cell', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('lost'))
    .mockImplementationOnce(async (_, init) => {
      const value = await (await retained(init!.body as string)).json();
      value.result.status = 'error';
      value.result.error = 'native calculation failed';
      return new Response(JSON.stringify(value));
    });
  const client = new NativeCellExecution(
    'book',
    'cell',
    sessionStorage,
    new NativeNotebookTransport('book', fetcher)
  );
  await expect(client.execute('source', signal())).rejects.toThrow('lost');
  expect((await client.execute('source', signal())).status).toBe('error');
  expect(fetcher).toHaveBeenCalledTimes(2);
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
it('bounds a stalled native request and retains its exact invocation for retry', async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      async (_, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), {
            once: true,
          });
        })
    )
    .mockImplementationOnce(async (_, init) => retained(init!.body as string));
  const client = new NativeCellExecution(
    'book',
    'cell',
    sessionStorage,
    new NativeNotebookTransport('book', fetcher)
  );
  try {
    const first = client.execute('source', signal());
    deadline.abort(new DOMException('Native execution request timed out', 'TimeoutError'));
    await expect(first).rejects.toThrow('timed out');
    expect(sessionStorage.length).toBe(1);
    timeout.mockRestore();
    expect((await client.execute('source', signal())).status).toBe('ok');
    expect(fetcher.mock.calls[0][1]!.body).toBe(fetcher.mock.calls[1][1]!.body);
  } finally {
    timeout.mockRestore();
  }
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

it('retains an explicit review wait across client recreation and clears only the terminal result', async () => {
  let executions = 0;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const request = JSON.parse(init!.body as string);
    if (String(url).endsWith('/executions/lookup'))
      return new Response(
        JSON.stringify({
          frontend_notebook_id: 'book',
          cell_id: request.cell_id,
          invocation: request.invocation,
          status: 'unconfirmed',
          result: null,
        })
      );
    if (++executions < 3)
      return new Response(
        JSON.stringify({
          frontend_notebook_id: 'book',
          cell_id: request.cell_id,
          invocation: request.invocation,
          status: 'pending',
          error: 'E_PERMISSION_PENDING',
          outputs: [{ type: 'text', content: '等待自动审核；再次运行此单元格可继续。' }],
        })
      );
    return response(init!.body as string);
  });
  const transport = new NativeNotebookTransport('book', fetcher);
  for (let i = 0; i < 2; i++) {
    const result = await new NativeCellExecution('book', 'cell', sessionStorage, transport).execute(
      'source',
      signal()
    );
    expect(result.status).toBe('pending');
    expect(result.outputs?.[0].content).toContain('等待');
    expect(sessionStorage.length).toBe(1);
  }
  expect(
    (
      await new NativeCellExecution('book', 'cell', sessionStorage, transport).execute(
        'source',
        signal()
      )
    ).status
  ).toBe('ok');
  expect(new Set(fetcher.mock.calls.map((call) => call[1]!.body)).size).toBe(1);
  expect(sessionStorage.length).toBe(0);
});

it.each(['valid', 'wrong-source', 'outside-source'] as const)(
  'validates and retains native diagnostics for %s',
  async (kind) => {
    const source =
      'agent Cell is Agent\n  public\n    ability run() -> Any\n      return 100 / 0\n';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    const metadata = {
      source_sha256: kind === 'wrong-source' ? '0'.repeat(64) : hash,
      diagnostics: [
        {
          phase: 'runtime',
          code: 'E_VALUE',
          message: 'division by zero',
          span: { line: kind === 'outside-source' ? 100 : 4, column: 14 },
        },
      ],
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      const request = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          frontend_notebook_id: 'book',
          cell_id: request.cell_id,
          invocation: request.invocation,
          status: 'error',
          error: 'division by zero',
          outputs: [{ type: 'error', content: 'division by zero', metadata }],
        })
      );
    });
    const client = new NativeCellExecution(
      'book',
      'cell',
      sessionStorage,
      new NativeNotebookTransport('book', fetcher)
    );
    if (kind === 'valid') {
      const result = await client.execute(source, signal());
      expect(result.outputs![0].metadata).toEqual(metadata);
      expect(sessionStorage.length).toBe(0);
    } else {
      await expect(client.execute(source, signal())).rejects.toThrow(/diagnostic/);
      expect(sessionStorage.length).toBe(1);
    }
  }
);
