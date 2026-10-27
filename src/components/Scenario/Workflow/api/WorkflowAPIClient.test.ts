import { afterEach, expect, it, vi } from 'vitest';
import { createInitialStateJSON } from '@Store/models';
import { WorkflowAPIClient } from './WorkflowAPIClient';

const methods = ['callPlanningAPI', 'callGeneratingAPI', 'callReflectingAPI'] as const;
const encoder = new TextEncoder();
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function respond(stream: ReadableStream<Uint8Array>) {
  const fetch = vi.fn().mockResolvedValue(new Response(stream));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it.each(methods)(
  '%s decodes split Unicode, SSE data and final JSON without newline',
  async (method) => {
    const messages = [{ action: { type: 'hello', text: '中文🙂' } }, { action: { type: 'done' } }];
    const bytes = encoder.encode(
      `: comment\n\ndata: ${JSON.stringify(messages[0])}\r\n${JSON.stringify(messages[1])}`
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    respond(stream);
    const result = [];
    for await (const action of new WorkflowAPIClient()[method](createInitialStateJSON()))
      result.push(action);
    expect(result).toEqual(messages);
    expect(stream.locked).toBe(false);
  }
);
it.each(methods)('%s cancels a blocked body read and releases its lock', async (method) => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  const fetch = respond(stream);
  const abort = new AbortController();
  const iterator = new WorkflowAPIClient()[method](createInitialStateJSON(), abort.signal);
  const pending = iterator.next();
  await vi.waitFor(() => expect(stream.locked).toBe(true));
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort();
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
it.each(methods)('%s cancels unread body when the consumer returns early', async (method) => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"n":1}\n{"n":2}\n'));
    },
    cancel,
  });
  respond(stream);
  const iterator = new WorkflowAPIClient()[method](createInitialStateJSON());
  expect((await iterator.next()).value).toEqual({ n: 1 });
  await iterator.return(undefined);
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});
it('does not fetch for an already cancelled request', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const abort = new AbortController();
  abort.abort();
  await expect(
    new WorkflowAPIClient().callPlanningAPI(createInitialStateJSON(), abort.signal).next()
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled();
});
it('retains request timeout when no caller cancellation is supplied', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  respond(stream);
  await expect(
    new WorkflowAPIClient({ timeout: 20 }).callPlanningAPI(createInitialStateJSON()).next()
  ).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});
it('cancels a response arriving after its fetch ignored cancellation', async () => {
  let respondLate!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respondLate = resolve;
        })
    )
  );
  const abort = new AbortController();
  const pending = new WorkflowAPIClient()
    .callPlanningAPI(createInitialStateJSON(), abort.signal)
    .next();
  const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort();
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  respondLate(new Response(stream));
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});

it.each(methods)('%s preserves cancellation when reader cleanup rejects', async (method) => {
  const cleanupFailure = new Error('body cancellation failed');
  const cancel = vi.fn().mockRejectedValue(cleanupFailure);
  const stream = new ReadableStream<Uint8Array>({ cancel });
  respond(stream);
  const abort = new AbortController();
  const reason = new Error('workflow stopped');
  const pending = new WorkflowAPIClient()[method](createInitialStateJSON(), abort.signal).next();
  const assertion = expect(pending).rejects.toBe(reason);
  await vi.waitFor(() => expect(stream.locked).toBe(true));
  abort.abort(reason);
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});

it('preserves cancellation when a late response fails to cancel its body', async () => {
  let respondLate!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respondLate = resolve;
        })
    )
  );
  const abort = new AbortController();
  const reason = new Error('request superseded');
  const pending = new WorkflowAPIClient()
    .callPlanningAPI(createInitialStateJSON(), abort.signal)
    .next();
  const assertion = expect(pending).rejects.toBe(reason);
  abort.abort(reason);
  const cancel = vi.fn().mockRejectedValue(new Error('late body cleanup failed'));
  const stream = new ReadableStream<Uint8Array>({ cancel });
  respondLate(new Response(stream));
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});

it('reports cleanup failure when an otherwise successful consumer returns early', async () => {
  const failure = new Error('cleanup failed');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"type":"first"}\n'));
    },
    cancel() {
      throw failure;
    },
  });
  respond(stream);
  const iterator = new WorkflowAPIClient().callPlanningAPI(createInitialStateJSON());
  await iterator.next();
  await expect(iterator.return(undefined)).rejects.toBe(failure);
  expect(stream.locked).toBe(false);
});
