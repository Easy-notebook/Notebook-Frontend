import { afterEach, expect, it, vi } from 'vitest';
import { HybridCellViewModel } from './HybridCellViewModel';
import { standaloneFence } from '@Utils/markdown/fencedMarkdown';
const state = vi.hoisted(() => ({ updateCell: vi.fn(), cells: [] as any[] }));
function createModel(cell: ConstructorParameters<typeof HybridCellViewModel>[0]) {
  state.cells = [cell];
  return new HybridCellViewModel(cell);
}
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => state } }));
afterEach(() => {
  vi.clearAllMocks();
  state.cells = [];
});
it('keeps Mermaid in Markdown preview while selecting executable code separately', () => {
  const diagram = '```mermaid\ngraph TD; A-->B\n```';
  const vm = createModel({ id: 'hybrid', type: 'hybrid', content: diagram });
  expect(vm.contentType.type).toBe('markdown');
  vm.updateProps({ id: 'hybrid', type: 'hybrid', content: diagram + '\n\n```python\nx\n```' });
  expect(vm.contentType).toMatchObject({ type: 'code', content: 'x' });
  expect(vm.precedingMarkdown).toContain(diagram);
});

it('does not publish a stale edit after the cell is removed', () => {
  const vm = createModel({ id: 'removed', type: 'hybrid', content: '```python\nx\n```' });
  state.cells = [];
  vm.handleContentChange('late edit');
  expect(state.updateCell).not.toHaveBeenCalled();
});

it('preserves code whitespace and surrounding Markdown when editing a hybrid fence', () => {
  const vm = createModel({
    id: 'hybrid',
    type: 'hybrid',
    content: 'Before\n\n~~~python\n  print(1)\n\n~~~\n\nAfter',
  });
  expect(vm.contentType).toMatchObject({
    type: 'code',
    language: 'python',
    content: '  print(1)\n',
  });
  vm.handleContentChange('  print(2)\n');
  expect(state.updateCell).toHaveBeenCalledWith(
    'hybrid',
    'Before\n\n~~~python\n  print(2)\n\n~~~\n\nAfter'
  );
});
it('keeps incomplete fences literal and invalidates cached parsing after source updates', () => {
  const vm = createModel({
    id: 'hybrid',
    type: 'hybrid',
    content: '```python\nprint(1)',
  });
  expect(vm.contentType.type).toBe('markdown');
  vm.updateProps({ id: 'hybrid', type: 'hybrid', content: '```python\nprint(1)\n```' });
  expect(vm.contentType).toMatchObject({ type: 'code', content: 'print(1)' });
  vm.updateProps({ id: 'hybrid', type: 'hybrid', content: 'plain' });
  expect(vm.contentType).toMatchObject({ type: 'markdown', content: 'plain' });
});
it('grows delimiters when edited code contains fence-like lines', () => {
  const vm = createModel({
    id: 'hybrid',
    type: 'hybrid',
    content: '```python\nx\n```',
  });
  const code = 'x\n```\ny';
  vm.handleContentChange(code);
  expect(standaloneFence(state.updateCell.mock.calls[0][1])?.code).toBe(code);
});
it('preserves fence indentation, info spacing, CRLF and a longer closing delimiter on edits', () => {
  const vm = createModel({
    id: 'hybrid', type: 'hybrid',
    content: 'Before\r\n  ~~~~python custom  \r\nold\r\n ~~~~~  \t\r\nAfter',
  });
  vm.handleContentChange('new');
  expect(state.updateCell).toHaveBeenCalledWith('hybrid',
    'Before\r\n  ~~~~python custom  \r\nnew\r\n ~~~~~  \t\r\nAfter');
});
it('preserves newly streamed surrounding text before React updates the view-model props', () => {
  const vm = createModel({
    id: 'hybrid',
    type: 'hybrid',
    content: '```python\nx\n```\nold',
  });
  state.cells = [
    { id: 'hybrid', type: 'hybrid', content: 'new prefix\n```python\nx\n```\nnew suffix' },
  ];
  vm.handleContentChange('edited');
  expect(state.updateCell).toHaveBeenCalledWith(
    'hybrid',
    'new prefix\n```python\nedited\n```\nnew suffix'
  );
});
it('does not mutate a cell converted to another type before the input callback runs', () => {
  const vm = createModel({
    id: 'hybrid',
    type: 'hybrid',
    content: '```python\nx\n```',
  });
  state.cells = [{ id: 'hybrid', type: 'markdown', content: 'converted' }];
  vm.handleContentChange('stale edit');
  expect(state.updateCell).not.toHaveBeenCalled();
});
it('does not replace surrounding content after the edited fence was removed externally', () => {
  const vm = createModel({
    id: 'hybrid',
    type: 'hybrid',
    content: '```python\nx\n```',
  });
  state.cells = [{ id: 'hybrid', type: 'hybrid', content: 'remaining text' }];
  vm.handleContentChange('stale code');
  expect(state.updateCell).not.toHaveBeenCalled();
});
it('does not reinterpret a stale Markdown edit as code after a fence appears externally', () => {
  const vm = createModel({ id: 'hybrid', type: 'hybrid', content: 'plain draft' });
  state.cells = [{ id: 'hybrid', type: 'hybrid', content: 'intro\n```python\nnew_code\n```' }];
  vm.handleContentChange('plain draft edited');
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(vm.contentType).toMatchObject({ type: 'code', content: 'new_code' });
});
it.each([
  '  ~~~~python  \r\n  x\r\n~~~~~  ',
  '```python custom-info\n\n  x\n\n```',
  'plain content',
])('does not normalize or publish unchanged source: %s', (content) => {
  const vm = createModel({ id: 'hybrid', type: 'hybrid', content });
  vm.handleContentChange(vm.contentType.content);
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(vm.cell.content).toBe(content);
});
