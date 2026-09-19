import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ props: {} as any, items: [] as string[] }));
vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: any) => {
    state.props = props;
    return props.children;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => (
    <div data-testid="overlay">{children}</div>
  ),
  useSensors: vi.fn(),
  useSensor: vi.fn(),
  KeyboardSensor: {},
  PointerSensor: {},
  closestCenter: {},
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: (props: any) => {
    state.items = props.items;
    return props.children;
  },
  sortableKeyboardCoordinates: {},
  verticalListSortingStrategy: {},
  arrayMove: (items: unknown[], from: number, to: number) => {
    const result = [...items];
    result.splice(to, 0, result.splice(from, 1)[0]);
    return result;
  },
}));
vi.mock('./DraggableCell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import DraggableCellList from './DraggableCellList';

it('cancellation and removal end ownership even if the cell is restored', () => {
  const cells = [
    { id: 'a', type: 'markdown', content: 'A' },
    { id: 'b', type: 'markdown', content: 'B' },
  ];
  const reorder = vi.fn();
  const props = {
    cells,
    onCellsReorder: reorder,
    renderCell: (cell: (typeof cells)[number]) => cell.content,
  };
  const view = render(<DraggableCellList {...props} />);
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  const end = state.props.onDragEnd;
  act(() => state.props.onDragCancel({ active: { id: 'a' } }));
  act(() => end({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).not.toHaveBeenCalled();
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  view.rerender(<DraggableCellList {...props} cells={[cells[1]]} />);
  view.rerender(<DraggableCellList {...props} />);
  act(() => end({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).not.toHaveBeenCalled();
  expect(screen.getByTestId('overlay').textContent).toBe('');
});

it('consumes a drag once and ignores an ended drag while another cell is active', () => {
  const cells = [
    { id: 'a', type: 'markdown', content: 'A' },
    { id: 'b', type: 'markdown', content: 'B' },
  ];
  const reorder = vi.fn();
  render(
    <DraggableCellList cells={cells} onCellsReorder={reorder} renderCell={(cell) => cell.content} />
  );
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  const end = state.props.onDragEnd;
  act(() => end({ active: { id: 'a' }, over: { id: 'b' } }));
  act(() => end({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).toHaveBeenCalledTimes(1);
  act(() => state.props.onDragStart({ active: { id: 'b' } }));
  act(() => end({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('overlay').textContent).toBe('B');
});

it('reuses sortable IDs and derives the overlay from current cells, not a drag-start snapshot', () => {
  const cells = [
    { id: 'a', type: 'markdown', content: 'old' },
    { id: 'b', type: 'markdown', content: 'B' },
  ];
  const reorder = vi.fn();
  const props = {
    cells,
    onCellsReorder: reorder,
    renderCell: (cell: (typeof cells)[number]) => <span>{cell.content}</span>,
  };
  const view = render(<DraggableCellList {...props} />);
  const ids = state.items;
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  expect(state.items).toBe(ids);
  const pendingEnd = state.props.onDragEnd;
  view.rerender(
    <DraggableCellList {...props} cells={[{ ...cells[0], content: 'new' }, cells[1]]} />
  );
  expect(screen.getByTestId('overlay').textContent).toBe('new');
  act(() => pendingEnd({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder.mock.calls[0][0].map((cell: (typeof cells)[number]) => cell.content)).toEqual([
    'B',
    'new',
  ]);
  expect(screen.getByTestId('overlay').textContent).toBe('');
});

it('drops a removed overlay and does not reorder missing or unchanged targets', () => {
  const cells = [
    { id: 'a', type: 'markdown', content: 'A' },
    { id: 'b', type: 'markdown', content: 'B' },
  ];
  const reorder = vi.fn();
  const props = { cells, onCellsReorder: reorder, renderCell: () => <span>A</span> };
  const view = render(<DraggableCellList {...props} />);
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  act(() => state.props.onDragEnd({ active: { id: 'a' }, over: { id: 'a' } }));
  expect(reorder).not.toHaveBeenCalled();
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  const pendingEnd = state.props.onDragEnd;
  view.rerender(<DraggableCellList {...props} cells={[]} />);
  expect(screen.getByTestId('overlay').textContent).toBe('');
  act(() => pendingEnd({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).not.toHaveBeenCalled();
});

it('ends drag ownership on disable and ignores callbacks from the unmounted sensor', () => {
  const cells = [
    { id: 'a', type: 'markdown', content: 'A' },
    { id: 'b', type: 'markdown', content: 'B' },
  ];
  const reorder = vi.fn();
  const props = {
    cells,
    onCellsReorder: reorder,
    renderCell: (cell: (typeof cells)[number]) => cell.content,
  };
  const view = render(<DraggableCellList {...props} />);
  act(() => state.props.onDragStart({ active: { id: 'a' } }));
  const oldEnd = state.props.onDragEnd;
  view.rerender(<DraggableCellList {...props} disabled />);
  act(() => oldEnd({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).not.toHaveBeenCalled();
  view.rerender(<DraggableCellList {...props} />);
  expect(screen.getByTestId('overlay').textContent).toBe('');
  act(() => oldEnd({ active: { id: 'a' }, over: { id: 'b' } }));
  expect(reorder).not.toHaveBeenCalled();
});
