import { describe, expect, it, vi } from 'vitest';
import { CodeCellViewModel } from './CodeCellViewModel';
import useStore from '@Store/notebookStore';

describe('code edit publication', () => {
  it.each(['Enter', 'ArrowUp', 'ArrowDown', 'Backspace'])(
    'does not intercept %s during IME composition',
    (key) => {
      const vm = new CodeCellViewModel({ id: 'code', type: 'code', content: '', outputs: [] });
      const execute = vi.spyOn(vm, 'execute');
      for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
        const event = { key, ctrlKey: true, altKey: true, nativeEvent, preventDefault: vi.fn() };
        expect(vm.handleKeyDown(event as any)).toBeNull();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
      }
    }
  );
  it('publishes code immediately so a following structural edit cannot see stale content', () => {
    const original = useStore.getState().updateCell;
    const updateCell = vi.fn();
    useStore.setState({ updateCell });
    try {
      const vm = new CodeCellViewModel({ id: 'code', type: 'code', content: 'old', outputs: [] });
      vm.handleChange('latest');
      expect(updateCell).toHaveBeenCalledWith('code', 'latest');
      expect(vm.localContent).toBe('latest');
    } finally {
      useStore.setState({ updateCell: original });
    }
  });
});
