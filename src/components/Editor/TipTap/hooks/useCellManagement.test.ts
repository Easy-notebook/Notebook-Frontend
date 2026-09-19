import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models';
import { useCellManagement } from './useCellManagement';

it.each([
  ['addCodeCell', 'code', 'python', true],
  ['addHybridCell', 'hybrid', 'python', true],
  ['addMarkdownCell', 'markdown', undefined, true],
  ['addRawCell', 'raw', undefined, true],
  ['addAIThinkingCell', 'thinking', undefined, false],
] as const)('creates %s with consistent defaults and preserves existing cells', (method, type, language, enableEdit) => {
  const existing: Cell = { id: 'existing', type: 'raw', content: 'keep' };
  const cells = [existing];
  const setCells = vi.fn();
  const { result } = renderHook(() => useCellManagement({ getCells: () => cells, setCells }));
  let id = '';
  act(() => { id = result.current[method](); });
  const next = setCells.mock.calls[0][0] as Cell[];
  expect(next).toHaveLength(2);
  expect(next[0]).toBe(existing);
  expect(cells).toHaveLength(1);
  expect(next[1]).toMatchObject({ id, type, content: '', outputs: [], enableEdit });
  expect(next[1].language).toBe(language);
  expect(id).not.toBe(existing.id);
});

it('preserves both cells when creation methods run before React rerenders', () => {
  let cells: Cell[] = [{ id: 'existing', type: 'raw', content: 'keep' }];
  const setCells = (next: Cell[]) => { cells = next; };
  const { result } = renderHook(() => useCellManagement({ getCells: () => cells, setCells }));
  let first = '', second = '';
  act(() => {
    first = result.current.addCodeCell();
    second = result.current.addMarkdownCell();
  });
  expect(cells.map(cell => cell.id)).toEqual(['existing', first, second]);
});
