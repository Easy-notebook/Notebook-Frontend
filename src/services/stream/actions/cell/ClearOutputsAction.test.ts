import { expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { ClearOutputsAction } from './ClearOutputsAction';
import type { StreamActionContext } from '../../types';

it('clears 1000 populated cells in one publication and makes repeated clearing a no-op', async () => {
  const original = useStore.getState();
  let unsubscribe = () => {};
  try {
    useStore.getState().setCells([
      { id: 'title', type: 'markdown', content: '# Notebook' },
      ...Array.from({ length: 1000 }, (_, i) => ({ id: `code-${i}`, type: 'code' as const,
        content: 'print(1)', outputs: [{ type: 'text', content: '1' }] })),
    ]);
    const before = useStore.getState().cells;
    const notified = vi.fn();
    unsubscribe = useStore.subscribe(notified);
    const showToast = vi.fn();
    const context = { showToast } as unknown as StreamActionContext;
    await new ClearOutputsAction().execute(context);
    expect(notified).toHaveBeenCalledOnce();
    const after = useStore.getState();
    expect(after.cells[0]).toBe(before[0]);
    expect(after.cells.every(cell => !cell.outputs?.length)).toBe(true);
    expect(before[1].outputs).toHaveLength(1);
    expect(after.tasks[0].phases[0].steps[0].content?.[0]).toBe(after.cells[1]);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('1000') }));
    notified.mockClear();
    await new ClearOutputsAction().execute(context);
    after.clearCellOutputs('code-0');
    expect(notified).not.toHaveBeenCalled();
    expect(useStore.getState()).toBe(after);
  } finally { unsubscribe(); useStore.setState(original, true); }
});
