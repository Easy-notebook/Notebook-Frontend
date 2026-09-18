import { describe, expect, it, vi } from 'vitest';
import { CodeCellViewModel } from './CodeCellViewModel';
import useStore from '@Store/notebookStore';

describe('code edit publication', () => {
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
