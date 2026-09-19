import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models';
import type { KeyboardEvent } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
const state = vi.hoisted(() => ({ cells: [] as Cell[], updateCell: vi.fn(), addCell: vi.fn(), deleteCell: vi.fn(), setCurrentCell: vi.fn(), editingCellId: null, setEditingCellId: vi.fn() }));
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => state } }));
import { MarkdownCellViewModel } from './MarkdownCellViewModel';
beforeEach(() => { vi.useFakeTimers(); state.cells = [{ id: 'a', type: 'markdown', content: 'old' }]; });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('flushes final input on blur without a second delayed write', () => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  vm.handleChange('last edit');
  expect(state.updateCell).not.toHaveBeenCalled();
  vm.handleBlur();
  expect(state.updateCell).toHaveBeenCalledWith('a', 'last edit');
  vi.runAllTimers();
  expect(state.updateCell).toHaveBeenCalledTimes(1);
});

it('publishes during sustained typing instead of postponing every update indefinitely', () => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  for (let index = 0; index < 6; index++) {
    vm.handleChange(`edit ${index}`);
    vi.advanceTimersByTime(200);
  }
  expect(state.updateCell).toHaveBeenCalledWith('a', 'edit 4');
  vm.flushPendingChanges();
  expect(state.updateCell).toHaveBeenLastCalledWith('a', 'edit 5');
  expect(state.updateCell).toHaveBeenCalledTimes(2);
});

it('does not replace newer typing with acknowledgement of its own preceding write', () => {
  const original = state.cells[0];
  const vm = new MarkdownCellViewModel(original);
  vm.handleChange('first batch');
  vi.advanceTimersByTime(300);
  vm.handleChange('second batch');
  const acknowledged = { ...original, content: 'first batch' };
  state.cells = [acknowledged];
  vm.updateProps(acknowledged);
  expect(vm.localContent).toBe('second batch');
  vm.flushPendingChanges();
  expect(state.updateCell).toHaveBeenLastCalledWith('a', 'second batch');
});

it('cancels pending input when props receive an external content revision', () => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  vm.handleChange('pending');
  state.cells = [{ ...state.cells[0], content: 'external' }];
  vm.updateProps(state.cells[0]);
  vm.flushPendingChanges();
  vi.runAllTimers();
  expect(vm.localContent).toBe('external');
  expect(state.updateCell).not.toHaveBeenCalled();
});

it.each(['removed', 'converted'])('does not publish pending input after the cell is %s', change => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  vm.handleChange('pending');
  state.cells = change === 'removed' ? [] : [{ ...state.cells[0], type: 'code' }];
  vm.flushPendingChanges();
  expect(state.updateCell).not.toHaveBeenCalled();
});

it.each([
  '  Before\n\n```python\n  print(1)\n\n```\n\nAfter  ',
  '```mermaid\nflowchart LR\n A-->B\n```',
  '```python\n  unfinished',
  '````markdown\n```python\nx\n```\n````',
  '# Heading\n',
  '  ~~~python\r\n x\r\n~~~\r\n',
])('keeps Markdown source literal without structural side effects: %j', source => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  vm.handleChange(source);
  vm.flushPendingChanges();
  expect(state.updateCell).toHaveBeenCalledWith('a', source);
  expect(state.addCell).not.toHaveBeenCalled();
  expect(state.deleteCell).not.toHaveBeenCalled();
  expect(vm.localContent).toBe(source);
});

it.each([{ isComposing: true }, { keyCode: 229 }])('leaves IME confirmation to the input method: %j', nativeEvent => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  const preventDefault = vi.fn();
  vm.handleKeyDown({ key: 'Enter', nativeEvent, preventDefault } as unknown as KeyboardEvent);
  expect(preventDefault).not.toHaveBeenCalled();
  expect(state.addCell).not.toHaveBeenCalled();
  expect(state.setEditingCellId).not.toHaveBeenCalled();
});

it.each(['ctrlKey', 'metaKey'])('flushes pending text before %s+Enter changes edit mode', modifier => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  vm.handleChange('latest input');
  const preventDefault = vi.fn();
  vm.handleKeyDown({ key: 'Enter', [modifier]: true, nativeEvent: {}, preventDefault } as unknown as KeyboardEvent);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(state.updateCell).toHaveBeenCalledWith('a', 'latest input');
  expect(state.setEditingCellId).toHaveBeenCalledTimes(1);
  expect(state.updateCell.mock.invocationCallOrder[0]).toBeLessThan(state.setEditingCellId.mock.invocationCallOrder[0]);
  vi.runAllTimers();
  expect(state.updateCell).toHaveBeenCalledTimes(1);
});

it('does not navigate across cells from CodeMirror arrows during composition', () => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  const navigate = vi.spyOn(vm, 'navigateToSibling');
  const editorState = EditorState.create({ extensions: [vm.boundaryKeymap] });
  for (const binding of editorState.facet(keymap).flat()) {
    expect(binding.run?.({ composing: true } as EditorView)).toBe(false);
  }
  expect(navigate).not.toHaveBeenCalled();
});

it.each(['# Untitled', '# ', '# Real title'])('creates a genuinely blank cell after title Enter: %j', content => {
  state.cells = [{ ...state.cells[0], content }];
  const vm = new MarkdownCellViewModel(state.cells[0]);
  const preventDefault = vi.fn();
  vm.handleKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault } as unknown as KeyboardEvent);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(state.addCell).toHaveBeenCalledTimes(1);
  const [created, index] = state.addCell.mock.calls[0];
  expect(created).toMatchObject({ type: 'markdown', content: '', outputs: [], enableEdit: true });
  expect(created.id).not.toBe('a');
  expect(index).toBe(1);
  expect(state.setEditingCellId).toHaveBeenCalledWith(created.id);
  expect(state.updateCell).not.toHaveBeenCalled();
});

it('flushes pending text before moving focus to another cell', () => {
  state.cells = [...state.cells, { id: 'b', type: 'markdown', content: 'Next' }];
  const vm = new MarkdownCellViewModel(state.cells[0]);
  vm.handleChange('final before navigation');
  vm.navigateToSibling('down');
  expect(state.updateCell).toHaveBeenCalledWith('a', 'final before navigation');
  expect(state.setCurrentCell).toHaveBeenCalledWith('b');
  expect(state.updateCell.mock.invocationCallOrder[0]).toBeLessThan(state.setCurrentCell.mock.invocationCallOrder[0]);
  vi.runAllTimers();
  expect(state.updateCell).toHaveBeenCalledTimes(1);
});

it('does not navigate from an identity absent from the current view', () => {
  const vm = new MarkdownCellViewModel(state.cells[0]);
  state.cells = [{ id: 'b', type: 'markdown', content: 'Next' }];
  vm.navigateToSibling('down');
  expect(state.setCurrentCell).not.toHaveBeenCalled();
});
