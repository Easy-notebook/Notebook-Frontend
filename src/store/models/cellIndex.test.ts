import { describe, expect, it, vi } from 'vitest';
import { getCellById } from './cellIndex';
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
    for (const cell of cells) expect(getCellById(cells, cell.id)).toBe(cell);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    const changed = [...cells];
    changed[0] = { ...changed[0], content: 'updated' };
    expect(getCellById(changed, '0')).toBe(changed[0]);
    expect(getCellById(changed, '1')).toBe(cells[1]);
    expect(getCellById(changed, 'missing')).toBeUndefined();
  });
});
