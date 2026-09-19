import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { useHybridCellViewModel } from './useHybridCellViewModel';

afterEach(cleanup);

it('keeps the parsed model for output-only updates and replaces it for source or identity changes', () => {
  const cell: Cell = { id: 'hybrid', type: 'hybrid', content: '```python\nold\n```' };
  const { result, rerender } = renderHook(useHybridCellViewModel, { initialProps: cell });
  const original = result.current;
  expect(original.contentType.content).toBe('old');
  rerender({ ...cell, outputs: [{ type: 'text', content: 'new result' }] });
  expect(result.current).toBe(original);
  rerender({ ...cell, content: '```python\nnew\n```' });
  expect(result.current).not.toBe(original);
  expect(result.current.contentType.content).toBe('new');
  // A new render does not mutate a model captured by an older render.
  expect(original.contentType.content).toBe('old');
  rerender({ ...cell, id: 'another' });
  expect(result.current.cell.id).toBe('another');
});
