import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useNotebookStore from '@Store/notebookStore';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { RunCurrentCodeCellAction } from './RunCurrentCodeCellAction';
const original = useNotebookStore.getState();
const agent = useAIAgentStore.getState();
const execute = vi.fn();
beforeEach(() => {
  execute.mockReset();
  useNotebookStore.setState({
    notebookId: 'a',
    currentCellId: 'code',
    cells: [{ id: 'code', type: 'code', content: 'print(1)' }],
    runSingleCell: execute,
  });
  useAIAgentStore.setState({
    qaList: [
      { id: 'qa', type: 'user', content: 'run', timestamp: '', resolved: false, onProcess: true },
    ],
  });
});
afterEach(() => {
  useNotebookStore.setState(original, true);
  useAIAgentStore.setState(agent, true);
});
const action = new RunCurrentCodeCellAction();
it('records execution on the captured QA after ordinary completion', async () => {
  execute.mockResolvedValue({ success: true });
  await action.execute({ payload: {}, showToast: vi.fn() });
  expect(execute).toHaveBeenCalledExactlyOnceWith('code');
  expect(useAIAgentStore.getState().qaList[0].toolCalls).toEqual([
    expect.objectContaining({ type: 'execute-code', content: 'print(1)' }),
  ]);
});
it('does not execute a command owned by another notebook', async () => {
  await action.execute({ payload: {}, notebookId: 'b', showToast: vi.fn() });
  expect(execute).not.toHaveBeenCalled();
});
it('does not execute an already cancelled command', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(
    action.execute({ payload: {}, showToast: vi.fn(), signal: controller.signal })
  ).rejects.toThrow('cancelled');
  expect(execute).not.toHaveBeenCalled();
});
it.each(['cancel', 'navigate', 'away-back'])(
  'does not record late completion after %s',
  async (reason) => {
    let finish!: () => void;
    execute.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const controller = new AbortController();
    const pending = action.execute({ payload: {}, showToast: vi.fn(), signal: controller.signal });
    if (reason === 'cancel') controller.abort();
    else {
      useNotebookStore.setState({ notebookId: 'b' });
      if (reason === 'away-back') useNotebookStore.setState({ notebookId: 'a' });
    }
    finish();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(useAIAgentStore.getState().qaList[0].toolCalls).toBeUndefined();
  }
);
