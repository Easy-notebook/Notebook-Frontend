import { afterEach, expect, it, vi } from 'vitest';
import type { ExecutionStep } from '@Store/models';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useScriptStore from './useScriptStore';
import useNotebookStore from '@Store/notebookStore';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../actions', () => ({
  getActionClass: (type: string) =>
    type === 'known'
      ? class {
          execute = mocks.execute;
        }
      : undefined,
}));
const original = useAIAgentStore.getState();
const notebook = useNotebookStore.getState();
afterEach(() => {
  vi.restoreAllMocks();
  useAIAgentStore.setState(original, true);
  useNotebookStore.setState(notebook, true);
  vi.resetAllMocks();
});
it.each([undefined, '', ' ', 4])(
  'rejects invalid action type %s before creating an execution record',
  async (action) => {
    const before = useAIAgentStore.getState().actions;
    await expect(
      useScriptStore.getState().execAction({ action } as unknown as ExecutionStep)
    ).rejects.toThrow('Action type must be a non-empty string');
    expect(useAIAgentStore.getState().actions).toBe(before);
    expect(mocks.execute).not.toHaveBeenCalled();
  }
);
it('rejects an unregistered action and settles its failure record', async () => {
  await expect(
    useScriptStore.getState().execAction({ action: 'unknown-command' } as ExecutionStep)
  ).rejects.toThrow('Unknown action type: unknown-command');
  const record = useAIAgentStore.getState().actions[0];
  expect(record.onProcess).toBe(false);
  expect(record.result).toContain('Unknown action type: unknown-command');
});
it('dispatches the captured request even if the caller mutates its object during admission', async () => {
  const request = {
    action: 'known',
    content: 'original',
    metadata: { marker: 'original' },
  } as ExecutionStep;
  mocks.execute.mockResolvedValue('done');
  const pending = useScriptStore.getState().execAction(request);
  request.content = 'changed';
  request.metadata!.marker = 'changed';
  await pending;
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ content: 'original', metadata: { marker: 'original' } }),
    expect.any(AbortSignal)
  );
});
it('updates the created record rather than a newer record inserted by a subscriber', async () => {
  mocks.execute.mockResolvedValue('own result');
  let inserted = false;
  const stop = useAIAgentStore.subscribe((state) => {
    if (!inserted && state.actions[0]?.onProcess) {
      inserted = true;
      state.addAction({
        ...state.actions[0],
        content: 'peer',
        result: 'peer result',
        onProcess: true,
      });
    }
  });
  try {
    await useScriptStore
      .getState()
      .execAction({ action: 'known', content: 'own request' } as ExecutionStep);
    const [peer, own] = useAIAgentStore.getState().actions;
    expect(peer).toMatchObject({ content: 'peer', result: 'peer result', onProcess: true });
    expect(own).toMatchObject({ result: 'own result', onProcess: false });
  } finally {
    stop();
  }
});

it('rejects cancellation during admission before executing the action', async () => {
  const abort = new AbortController();
  const pending = useScriptStore.getState().execAction({ action: 'known' }, abort.signal);
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each([false, true])(
  'rejects notebook changes during admission (returning: %s)',
  async (returning) => {
    useNotebookStore.setState({ notebookId: 'a' });
    const pending = useScriptStore.getState().execAction({ action: 'known' });
    useNotebookStore.setState({ notebookId: 'b' });
    if (returning) useNotebookStore.setState({ notebookId: 'a' });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.execute).not.toHaveBeenCalled();
  }
);
it('cancels execution after a sidebar subscriber changes notebooks and settles its record', async () => {
  useNotebookStore.setState({ notebookId: 'a' });
  const stop = useAIAgentStore.subscribe((state) => {
    if (state.actions[0]?.onProcess) useNotebookStore.setState({ notebookId: 'b' });
  });
  try {
    await expect(useScriptStore.getState().execAction({ action: 'known' })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(useAIAgentStore.getState().actions[0].onProcess).toBe(false);
  } finally {
    stop();
  }
});
it('forwards notebook invalidation to an already entered cooperative action', async () => {
  useNotebookStore.setState({ notebookId: 'a' });
  let release!: () => void;
  mocks.execute.mockImplementation(
    (_request, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        release = () => (signal.aborted ? reject(signal.reason) : resolve());
      })
  );
  const pending = useScriptStore.getState().execAction({ action: 'known' });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
  useNotebookStore.setState({ notebookId: 'b' });
  release();
  await rejected;
  expect(useAIAgentStore.getState().actions[0].onProcess).toBe(false);
});
it('accepts first notebook ID assignment during an admitted action', async () => {
  useNotebookStore.setState({ notebookId: null });
  mocks.execute.mockImplementation(async () => {
    useNotebookStore.setState({ notebookId: 'created' });
    return 'done';
  });
  await expect(useScriptStore.getState().execAction({ action: 'known' })).resolves.toBe('done');
});

it('releases ownership after success so later navigation cannot cancel a completed action', async () => {
  useNotebookStore.setState({ notebookId: 'a' });
  mocks.execute.mockResolvedValue('done');
  await useScriptStore.getState().execAction({ action: 'known' });
  const signal = mocks.execute.mock.calls[0][1] as AbortSignal;
  useNotebookStore.setState({ notebookId: 'b' });
  expect(signal.aborted).toBe(false);
});
it('releases the notebook subscription immediately when the caller cancels pending work', async () => {
  const subscribe = useNotebookStore.subscribe;
  const released = vi.fn();
  vi.spyOn(useNotebookStore, 'subscribe').mockImplementation((listener) => {
    const stop = subscribe(listener);
    return () => {
      released();
      stop();
    };
  });
  const abort = new AbortController();
  let finish!: () => void;
  mocks.execute.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pending = useScriptStore.getState().execAction({ action: 'known' }, abort.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
  abort.abort();
  expect(released).toHaveBeenCalledOnce();
  finish();
  await rejected;
  expect(released).toHaveBeenCalledOnce();
});
