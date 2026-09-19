import { expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { ConvertToCodeCellAction } from './ConvertToCodeCellAction';
import type { StreamActionContext } from '../../types';
it('publishes conversion once and removes thinking fields without losing unrelated data', async () => {
  const original = useStore.getState();
  let unsubscribe = () => {};
  try {
    useStore.getState().setCells([
      { id: 'title', type: 'markdown', content: '# Notebook' },
      { id: 'target', type: 'thinking', content: 'print(1)', enableEdit: false,
        outputs: [{ type: 'text', content: 'kept' }], metadata: { agentName: 'agent', customText: 'thinking', textArray: [], useWorkflowThinking: true, custom: 'keep' } },
    ]);
    const before = useStore.getState().cells;
    const notify = vi.fn();
    unsubscribe = useStore.subscribe(notify);
    const action = new ConvertToCodeCellAction();
    const context = { payload: { cellId: 'target' } } as unknown as StreamActionContext;
    await action.execute(context);
    expect(notify).toHaveBeenCalledOnce();
    const after = useStore.getState();
    expect(after.cells[1]).toMatchObject({ type: 'code', enableEdit: true, language: 'python', content: 'print(1)' });
    expect(after.cells[1].metadata).toEqual({ custom: 'keep', language: 'python' });
    expect(after.cells[1].outputs).toBe(before[1].outputs);
    await action.execute(context);
    expect(useStore.getState()).toBe(after);
    expect(notify).toHaveBeenCalledOnce();
  } finally { unsubscribe(); useStore.setState(original, true); }
});
