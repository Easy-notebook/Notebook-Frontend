import { describe, expect, it, vi } from 'vitest';
import { CodeCellViewModel } from './CodeCellViewModel';
import useStore from '@Store/notebookStore';
import { EditorState } from '@codemirror/state';

describe('code edit publication', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'selection'])(
    'does not convert empty code for %s Backspace',
    (kind) => {
      const original = useStore.getState();
      try {
        const vm = new CodeCellViewModel({ id: 'modified-backspace', type: 'code', content: '  ' });
        const state = EditorState.create({
          doc: '  ',
          selection: kind === 'selection' ? { anchor: 2, head: 0 } : { anchor: 0 },
        });
        vm.editorRef = { current: { view: { state } as any } };
        const event = {
          key: 'Backspace',
          nativeEvent: {},
          preventDefault: vi.fn(),
          ...(kind === 'selection' ? {} : { [kind]: true }),
        };
        expect(vm.handleKeyDown(event as any)).toBeNull();
        expect(event.preventDefault).not.toHaveBeenCalled();
      } finally {
        useStore.setState(original, true);
      }
    }
  );
  it('publishes empty-code conversion focus immediately without a stale delayed focus task', () => {
    const original = useStore.getState();
    vi.useFakeTimers();
    try {
      const cell = { id: 'empty-conversion', type: 'code' as const, content: '' };
      useStore.getState().setCells([cell]);
      useStore.setState({ editingCellId: null });
      const vm = new CodeCellViewModel(cell);
      vm.editorRef = { current: { view: { state: EditorState.create({ doc: '' }) } as any } };
      const before = vi.getTimerCount();
      expect(
        vm.handleKeyDown({ key: 'Backspace', nativeEvent: {}, preventDefault: vi.fn() } as any)
      ).toBe('convert');
      expect(useStore.getState().cells.find((item) => item.id === cell.id)?.type).toBe('markdown');
      expect(useStore.getState().editingCellId).toBe(cell.id);
      expect(vi.getTimerCount()).toBe(before);
      useStore.getState().setEditingCellId('another-cell');
      vi.advanceTimersByTime(100);
      expect(useStore.getState().editingCellId).toBe('another-cell');
    } finally {
      useStore.setState(original, true);
      vi.useRealTimers();
    }
  });
  it('keeps only one pending scroll and scrolls the current collapsed target', () => {
    vi.useFakeTimers();
    const element = document.createElement('div');
    element.scrollIntoView = vi.fn();
    document.body.append(element);
    try {
      const vm = new CodeCellViewModel({ id: 'current-scroll', type: 'code', content: '' });
      vm.codeContainerRef = { current: element };
      vm.handleCollapse();
      vm.handleCollapse();
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(100);
      expect(element.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
        behavior: 'smooth',
        block: 'start',
      });
    } finally {
      element.remove();
      vi.useRealTimers();
    }
  });
  it.each(['removed', 'replaced'])('does not scroll when the collapse target is %s', (reason) => {
    vi.useFakeTimers();
    const element = document.createElement('div');
    const replacement = document.createElement('div');
    element.scrollIntoView = vi.fn();
    replacement.scrollIntoView = vi.fn();
    document.body.append(element, replacement);
    try {
      const vm = new CodeCellViewModel({ id: 'stale-scroll', type: 'code', content: '' });
      const ref = { current: element };
      vm.codeContainerRef = ref;
      vm.handleCollapse();
      if (reason === 'removed') element.remove();
      else ref.current = replacement;
      vi.advanceTimersByTime(100);
      expect(element.scrollIntoView).not.toHaveBeenCalled();
      expect(replacement.scrollIntoView).not.toHaveBeenCalled();
    } finally {
      element.remove();
      replacement.remove();
      vi.useRealTimers();
    }
  });
  it('cancels a pending collapse scroll when the user expands again', () => {
    vi.useFakeTimers();
    const element = document.createElement('div');
    element.scrollIntoView = vi.fn();
    document.body.append(element);
    try {
      const vm = new CodeCellViewModel({ id: 'scroll-code', type: 'code', content: '' });
      vm.codeContainerRef = { current: element };
      vm.handleCollapse();
      vm.handleExpand();
      vi.advanceTimersByTime(100);
      expect(element.scrollIntoView).not.toHaveBeenCalled();
    } finally {
      element.remove();
      vi.useRealTimers();
    }
  });
  it.each(['focus', 'composition'])('does not auto-collapse while code owns %s', (interaction) => {
    const vm = new CodeCellViewModel({ id: 'typing-height', type: 'code', content: '' });
    const view = { hasFocus: interaction === 'focus', composing: interaction === 'composition' };
    vm.editorRef = { current: { view: view as any } };
    vm.setContentHeight(10000);
    expect(vm.contentHeight).toBe(10000);
    expect(vm.isExpanded).toBe(true);
    view.hasFocus = false;
    view.composing = false;
    vm.setContentHeight(10001);
    expect(vm.isExpanded).toBe(false);
  });
  it('publishes height changes once, ignores hidden measurements and preserves manual expansion', () => {
    const vm = new CodeCellViewModel({ id: 'height-code', type: 'code', content: '' });
    const changed = vi.fn();
    vm.subscribe(changed);
    vm.setContentHeight(10000);
    expect(vm.isExpanded).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
    vm.setContentHeight(10000);
    vm.setContentHeight(0);
    vm.setContentHeight(NaN);
    expect(changed).toHaveBeenCalledOnce();
    expect(vm.contentHeight).toBe(10000);
    vm.handleExpand();
    changed.mockClear();
    vm.setContentHeight(11000);
    expect(vm.isExpanded).toBe(true);
    expect(vm.contentHeight).toBe(11000);
    expect(changed).toHaveBeenCalledOnce();
  });
  it('preserves manual collapse across unrelated updates and expands only for new outputs', () => {
    const cell = {
      id: 'collapse-code',
      type: 'code' as const,
      content: 'old',
      outputs: [{ type: 'text', content: 'result' }],
    };
    const vm = new CodeCellViewModel(cell);
    vm.contentHeight = 10000;
    vm.handleCollapse();
    vm.updateProps({ ...cell, content: 'edited' }, false);
    expect(vm.isExpanded).toBe(false);
    vm.updateProps({ ...cell, metadata: { label: 'updated' } }, false);
    expect(vm.isExpanded).toBe(false);
    vm.updateProps(
      { ...cell, outputs: [...cell.outputs, { type: 'text', content: 'next' }] },
      false
    );
    expect(vm.isExpanded).toBe(true);
  });
  it('publishes a coherent prop update once and skips replaying identical props', () => {
    const vm = new CodeCellViewModel({
      id: 'atomic-code',
      type: 'code',
      content: 'old',
      outputs: [],
    });
    const states: unknown[] = [];
    vm.subscribe(() =>
      states.push({ content: vm.localContent, visible: vm.outputVisible, expanded: vm.isExpanded })
    );
    vm.isExpanded = false;
    vm.contentHeight = 10000;
    const next = {
      id: 'atomic-code',
      type: 'code' as const,
      content: 'new'.repeat(100),
      outputs: [{ type: 'text', content: 'result' }],
    };
    vm.updateProps(next, false);
    expect(states).toEqual([{ content: next.content, visible: true, expanded: true }]);
    vm.updateProps(next, false);
    expect(states).toHaveLength(1);
  });

  it('notifies a demo-mode-only update without requiring a new cell object', () => {
    const cell = { id: 'demo-props', type: 'code' as const, content: '', outputs: [] };
    const vm = new CodeCellViewModel(cell);
    const changed = vi.fn();
    vm.subscribe(changed);
    vm.updateProps(cell, true);
    expect(changed).toHaveBeenCalledOnce();
  });
  it('keeps output projection stable during unrelated view state changes', () => {
    const vm = new CodeCellViewModel({
      id: 'code',
      type: 'code',
      content: '',
      outputs: [{ type: 'text', content: 'result' }],
    });
    const first = vm.processedOutputs;
    vm.setIsHovering(true);
    expect(vm.processedOutputs).toBe(first);
    vm.setShowToolbar(true);
    expect(vm.processedOutputs[0]).toBe(first[0]);
  });
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
