import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models';
const store = vi.hoisted(() => ({ cells: [] as Cell[], updateCell: vi.fn() }));
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => store } }));
import { useMarkdownCellViewModel } from './useMarkdownCellViewModel';

beforeEach(() => {
  vi.useFakeTimers();
  store.cells = [
    { id: 'a', type: 'markdown', content: 'A' },
    { id: 'b', type: 'markdown', content: 'B' },
  ];
  store.updateCell.mockImplementation((id: string, content: string) => {
    store.cells = store.cells.map(cell => cell.id === id ? { ...cell, content } : cell);
  });
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

it('flushes the departing cell to its original ID and gives the next cell a separate model', () => {
  const hook = renderHook(({ cell }) => useMarkdownCellViewModel(cell), {
    initialProps: { cell: store.cells[0] },
  });
  const first = hook.result.current;
  act(() => first.handleChange('A edited'));
  hook.rerender({ cell: store.cells[1] });
  expect(hook.result.current).not.toBe(first);
  expect(hook.result.current.localContent).toBe('B');
  expect(store.updateCell.mock.calls).toEqual([['a', 'A edited']]);
  act(() => hook.result.current.handleChange('B edited'));
  hook.unmount();
  vi.runAllTimers();
  expect(store.updateCell.mock.calls).toEqual([['a', 'A edited'], ['b', 'B edited']]);
});

it('survives StrictMode effect replay without duplicate writes or discarded final input', () => {
  const hook = renderHook(() => useMarkdownCellViewModel(store.cells[0]), {
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  expect(store.updateCell).not.toHaveBeenCalled();
  act(() => hook.result.current.handleChange('last input'));
  hook.unmount();
  vi.runAllTimers();
  expect(store.updateCell.mock.calls).toEqual([['a', 'last input']]);
});

it('does not revive a removed cell while its view detaches', () => {
  const hook = renderHook(() => useMarkdownCellViewModel(store.cells[0]));
  act(() => hook.result.current.handleChange('pending'));
  store.cells = [];
  hook.unmount();
  vi.runAllTimers();
  expect(store.updateCell).not.toHaveBeenCalled();
});
