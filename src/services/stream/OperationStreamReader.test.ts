import { expect, it, vi } from 'vitest';
import { OperationStreamReader } from './OperationStreamReader';
const encoder = new TextEncoder();
function stream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}
it('decodes every byte boundary including Unicode, escaped strings and nested objects', async () => {
  const messages = [
    { text: '汉字🙂{quote:" slash:\\}', nested: { array: [{ a: 1 }] } },
    { type: 'done' },
  ];
  const bytes = encoder.encode(messages.map((value) => JSON.stringify(value)).join('\n '));
  const receive = vi.fn();
  const input = stream(Array.from(bytes, (byte) => new Uint8Array([byte])));
  await new OperationStreamReader().consume(input, receive);
  expect(receive.mock.calls.map((call) => call[0])).toEqual(messages);
  expect(input.locked).toBe(false);
});
it('awaits each handler in wire order and does not settle after the first chunk', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const input = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  let release!: () => void;
  const first = new Promise<void>((done) => {
    release = done;
  });
  const receive = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
  const completed = vi.fn();
  const pending = new OperationStreamReader().consume(input, receive).then(completed);
  controller.enqueue(encoder.encode('{"n":1}{"n":2}'));
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  expect(completed).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(2));
  expect(completed).not.toHaveBeenCalled();
  controller.enqueue(encoder.encode('{"n":3}'));
  controller.close();
  await pending;
  expect(receive.mock.calls.map((call) => call[0])).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  expect(completed).toHaveBeenCalledOnce();
});
it.each(['{"unfinished":', 'not-json', '{"invalid":}', '[]'])(
  'rejects invalid protocol input %s and releases the reader',
  async (text) => {
    const input = stream([encoder.encode(text)]);
    await expect(new OperationStreamReader().consume(input, vi.fn())).rejects.toThrow();
    expect(input.locked).toBe(false);
  }
);
it('rejects truncated UTF-8 at EOF instead of publishing replacement characters', async () => {
  const input = stream([encoder.encode('{"text":"'), new Uint8Array([0xe4, 0xb8])]);
  await expect(new OperationStreamReader().consume(input, vi.fn())).rejects.toThrow();
  expect(input.locked).toBe(false);
});
it('cancels transport and releases its lock after a handler failure', async () => {
  const cancel = vi.fn();
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{}'));
    },
    cancel,
  });
  const error = new Error('handler failed');
  await expect(
    new OperationStreamReader().consume(input, async () => {
      throw error;
    })
  ).rejects.toBe(error);
  expect(cancel).toHaveBeenCalledOnce();
  expect(input.locked).toBe(false);
});
it('propagates failures from a later read and releases the lock', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const input = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const receive = vi.fn();
  const pending = new OperationStreamReader().consume(input, receive);
  controller.enqueue(encoder.encode('{}'));
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  const assertion = expect(pending).rejects.toThrow('lost connection');
  controller.error(new Error('lost connection'));
  await assertion;
  expect(input.locked).toBe(false);
});

it('aborts a blocked reader and releases the lock', async () => {
  const abort = new AbortController();
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  const pending = new OperationStreamReader().consume(stream, vi.fn(), abort.signal);
  const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort();
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});

it('frames messages correctly at every possible two-chunk boundary', async () => {
  const messages = [{ code: 'print("汉字🙂\\"{}")', nested: [{ a: {} }] }, {}, { done: true }];
  const bytes = encoder.encode(
    ` \n${messages.map((value) => JSON.stringify(value)).join(' \t')}\n`
  );
  for (let split = 0; split <= bytes.length; split++) {
    const receive = vi.fn();
    await new OperationStreamReader().consume(
      stream([bytes.slice(0, split), new Uint8Array(), bytes.slice(split)]),
      receive
    );
    expect(receive.mock.calls.map(([message]) => message)).toEqual(messages);
  }
});

it('assembles large code payloads delivered in many small chunks', async () => {
  const message = { code: 'print("escaped \\\\ {汉字🙂}")\n'.repeat(10000) };
  const bytes = encoder.encode(JSON.stringify(message));
  let offset = 0;
  const input = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      const end = Math.min(offset + 17, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
  const receive = vi.fn();
  await new OperationStreamReader().consume(input, receive);
  expect(receive).toHaveBeenCalledExactlyOnceWith(message);
  expect(input.locked).toBe(false);
});

it('does not parse or publish a buffered successor after a handler cancels', async () => {
  const abort = new AbortController();
  const input = stream([encoder.encode('{}invalid successor')]);
  const receive = vi.fn(async () => abort.abort());
  await expect(
    new OperationStreamReader().consume(input, receive, abort.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(receive).toHaveBeenCalledOnce();
  expect(input.locked).toBe(false);
});

it('publishes complete messages before rejecting a truncated successor', async () => {
  const receive = vi.fn();
  await expect(
    new OperationStreamReader().consume(
      stream([encoder.encode('{"first":true}{"next":"'), encoder.encode('unfinished')]),
      receive
    )
  ).rejects.toThrow('incomplete JSON');
  expect(receive).toHaveBeenCalledExactlyOnceWith({ first: true });
});
