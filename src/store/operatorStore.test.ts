import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  initialize: vi.fn(),
  send: vi.fn(),
  handle: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@Store/codeStore', () => ({
  default: { getState: () => ({ initializeKernel: io.initialize }) },
}));
vi.mock('@Services/notebook/OperationService', () => ({
  OperationService: { sendOperation: io.send },
}));
vi.mock('@Services/stream', () => ({ handleStreamResponse: io.handle }));
vi.mock('@/components/UI/Toast', () => ({ showToast: io.toast }));
import useOperatorStore from './operatorStore';
const initial = useOperatorStore.getState();
const operation = { type: 'user_question', payload: { content: 'question' } };
const encoder = new TextEncoder();
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  return {
    stream,
    get controller() {
      return controller;
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  useOperatorStore.setState(initial, true);
  io.initialize.mockResolvedValue('created');
  io.handle.mockResolvedValue(undefined);
});
afterEach(() => useOperatorStore.setState(initial, true));
it('holds admission through all chunks and asynchronous handlers until EOF', async () => {
  const transport = controlledStream();
  io.send.mockResolvedValue(transport.stream);
  let release!: () => void;
  io.handle.mockReturnValueOnce(
    new Promise<void>((done) => {
      release = done;
    })
  );
  const pending = useOperatorStore.getState().sendOperation('notebook', operation);
  transport.controller.enqueue(encoder.encode('{"type":"one"}{"type":"two"}'));
  await vi.waitFor(() => expect(io.handle).toHaveBeenCalledOnce());
  expect(useOperatorStore.getState().isSendingOperation).toBe(true);
  await useOperatorStore.getState().sendOperation('notebook', operation);
  expect(io.send).toHaveBeenCalledOnce();
  release();
  await vi.waitFor(() => expect(io.handle).toHaveBeenCalledTimes(2));
  expect(useOperatorStore.getState().isSendingOperation).toBe(true);
  transport.controller.close();
  await pending;
  expect(useOperatorStore.getState().isSendingOperation).toBe(false);
  const id = useOperatorStore.getState().operations[0].id!;
  expect(useOperatorStore.getState().getOperationResponses(id)).toEqual([
    { type: 'one' },
    { type: 'two' },
  ]);
});
it('reserves before asynchronous kernel initialization so concurrent callers cannot both enter', async () => {
  let initialized!: (id: string) => void;
  io.initialize.mockReturnValue(
    new Promise<string>((done) => {
      initialized = done;
    })
  );
  const transport = controlledStream();
  io.send.mockResolvedValue(transport.stream);
  const first = useOperatorStore.getState().sendOperation(null, operation);
  await useOperatorStore.getState().sendOperation(null, operation);
  expect(io.initialize).toHaveBeenCalledOnce();
  initialized('created');
  transport.controller.close();
  await first;
  expect(io.send).toHaveBeenCalledExactlyOnceWith('created', operation);
});
it.each(['initialize', 'missing-body', 'handler', 'read'] as const)(
  'records %s failure and releases admission for retry',
  async (kind) => {
    const transport = controlledStream();
    io.send.mockResolvedValue(transport.stream);
    if (kind === 'initialize') io.initialize.mockRejectedValueOnce(new Error('init failed'));
    if (kind === 'missing-body') io.send.mockResolvedValueOnce(null);
    if (kind === 'handler') io.handle.mockRejectedValueOnce(new Error('handler failed'));
    const pending = useOperatorStore
      .getState()
      .sendOperation(kind === 'initialize' ? null : 'notebook', operation);
    if (kind === 'handler') transport.controller.enqueue(encoder.encode('{}'));
    else if (kind === 'read') transport.controller.error(new Error('read failed'));
    else transport.controller.close();
    await pending;
    expect(useOperatorStore.getState().error).toBeTruthy();
    expect(useOperatorStore.getState().isSendingOperation).toBe(false);
    const next = controlledStream();
    next.controller.close();
    io.send.mockResolvedValue(next.stream);
    await useOperatorStore.getState().sendOperation('notebook', operation);
    expect(useOperatorStore.getState().error).toBeNull();
  }
);

it('returns acceptance before EOF while the completion promise and busy state remain pending', async () => {
  const transport = controlledStream();
  io.send.mockResolvedValue(transport.stream);
  const receipt = await useOperatorStore.getState().submitOperation('notebook', operation);
  expect(receipt.accepted).toBe(true);
  if (!receipt.accepted) throw new Error('Expected acceptance');
  const completed = vi.fn();
  void receipt.completion.then(completed);
  expect(useOperatorStore.getState().isSendingOperation).toBe(true);
  const refused = await useOperatorStore.getState().submitOperation('notebook', operation);
  expect(refused).toMatchObject({ accepted: false, reason: 'busy' });
  expect(completed).not.toHaveBeenCalled();
  transport.controller.close();
  await receipt.completion;
  expect(completed).toHaveBeenCalledOnce();
  expect(useOperatorStore.getState().isSendingOperation).toBe(false);
});
it.each(['kernel', 'connection', 'body'] as const)(
  'returns a failed receipt for %s admission failure',
  async (stage) => {
    if (stage === 'kernel') io.initialize.mockResolvedValue(false);
    else if (stage === 'connection') io.send.mockRejectedValue(new Error('HTTP refused'));
    else io.send.mockResolvedValue(null);
    const receipt = await useOperatorStore
      .getState()
      .submitOperation(stage === 'kernel' ? null : 'notebook', operation);
    expect(receipt).toMatchObject({ accepted: false, reason: 'failed' });
    expect(useOperatorStore.getState().isSendingOperation).toBe(false);
  }
);
it('captures the operation payload before kernel initialization awaits', async () => {
  let initialized!: (id: string) => void;
  io.initialize.mockReturnValue(
    new Promise<string>((done) => {
      initialized = done;
    })
  );
  const transport = controlledStream();
  io.send.mockResolvedValue(transport.stream);
  const input = { type: 'user_question', payload: { content: 'original', nested: { version: 1 } } };
  const pending = useOperatorStore.getState().submitOperation(null, input);
  input.payload.content = 'changed';
  input.payload.nested.version = 2;
  initialized('created');
  const receipt = await pending;
  expect(io.send).toHaveBeenCalledWith('created', {
    type: 'user_question',
    payload: { content: 'original', nested: { version: 1 } },
  });
  transport.controller.close();
  if (receipt.accepted) await receipt.completion;
});
it('reports a stream failure after acceptance without changing the original receipt', async () => {
  const transport = controlledStream();
  io.send.mockResolvedValue(transport.stream);
  const receipt = await useOperatorStore.getState().submitOperation('notebook', operation);
  if (!receipt.accepted) throw new Error('Expected acceptance');
  transport.controller.error(new Error('later transport failure'));
  await receipt.completion;
  expect(receipt.accepted).toBe(true);
  expect(useOperatorStore.getState().error).toBe('later transport failure');
  expect(useOperatorStore.getState().isSendingOperation).toBe(false);
});
