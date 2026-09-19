import { afterEach, expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { ConvertCodeToHybridAction } from './ConvertCodeToHybridAction';
import type { StreamActionContext } from '../../types';
const original = useStore.getState();
afterEach(() => useStore.setState(original, true));
it.each([true, false])(
  'converts the requested or current code cell without replacing outputs (explicit=%s)',
  async (explicit) => {
    useStore.getState().setCells([
      { id: 'title', type: 'markdown', content: '# Notebook' },
      {
        id: 'target',
        type: 'code',
        content: '  x\n',
        language: 'typescript',
        outputs: [{ type: 'text', content: 'kept' }],
      },
      { id: 'other', type: 'code', content: 'untouched' },
    ]);
    useStore.setState({ currentCellId: explicit ? 'other' : 'target' });
    const before = useStore.getState().cells;
    const showToast = vi.fn();
    const context = {
      payload: explicit ? { cellId: 'target' } : {},
      showToast,
    } as unknown as StreamActionContext;
    const action = new ConvertCodeToHybridAction();
    await action.execute(context);
    const after = useStore.getState().cells;
    expect(after[1]).toMatchObject({ type: 'hybrid', content: '```typescript\n  x\n\n```' });
    expect(after[1].outputs).toBe(before[1].outputs);
    expect(after[2]).toBe(before[2]);
    expect(showToast).toHaveBeenCalledOnce();
    await action.execute(context);
    expect(useStore.getState().cells).toBe(after);
    expect(showToast).toHaveBeenCalledOnce();
  }
);
