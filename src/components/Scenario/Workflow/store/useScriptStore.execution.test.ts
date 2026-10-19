import { afterEach, expect, it, vi } from 'vitest';
import type { ExecutionStep } from '@Store/models';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useScriptStore from './useScriptStore';
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
afterEach(() => {
  useAIAgentStore.setState(original, true);
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
    undefined
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
