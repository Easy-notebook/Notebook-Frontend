import { describe, expect, it, vi } from 'vitest';
import { getCellById, getCellIndexById } from './cellIndex';
import type { Cell } from './index';

describe('shared cell index', () => {
  it('builds only once for all cell lookups and invalidates on immutable updates', () => {
    const cells: Cell[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `${i}`,
      type: 'markdown',
      content: '',
      outputs: [],
    }));
    const spy = vi.spyOn(cells, 'map');
    const readId = vi.fn(() => '0');
    Object.defineProperty(cells[0], 'id', { configurable: true, enumerable: true, get: readId });
    for (const cell of cells) expect(getCellById(cells, cell.id)).toBe(cell);
    expect(spy).not.toHaveBeenCalled();
    expect(getCellIndexById(cells, '999')).toBe(999);
    expect(getCellIndexById(cells, 'missing')).toBeUndefined();
    // One read by the caller's loop and one by the shared index construction.
    expect(readId).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    const changed = [...cells];
    changed[0] = { ...changed[0], content: 'updated' };
    expect(getCellById(changed, '0')).toBe(changed[0]);
    expect(getCellById(changed, '1')).toBe(cells[1]);
    expect(getCellById(changed, 'missing')).toBeUndefined();
    const reordered = [...changed].reverse();
    expect(getCellIndexById(reordered, '0')).toBe(999);
    expect(getCellById(reordered, '0')).toBe(changed[0]);
  });
});
