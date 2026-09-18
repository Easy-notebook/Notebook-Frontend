import type { Cell } from './index';

// Zustand/Immer publishes immutable arrays. Share one index across all consumers;
// weak keys allow obsolete notebook snapshots to be reclaimed.
const indexes = new WeakMap<readonly Cell[], ReadonlyMap<string, Cell>>();

export function getCellById(cells: readonly Cell[], id: string): Cell | undefined {
  let index = indexes.get(cells);
  if (!index) {
    index = new Map(cells.map((cell) => [cell.id, cell]));
    indexes.set(cells, index);
  }
  return index.get(id);
}
