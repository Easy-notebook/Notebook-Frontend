interface IdentifiedCell { readonly id: string }

// Zustand/Immer publishes immutable arrays. Share one index across all consumers;
// weak keys allow obsolete notebook snapshots to be reclaimed.
const indexes = new WeakMap<readonly IdentifiedCell[], ReadonlyMap<string, number>>();

export function getCellIndexById(cells: readonly IdentifiedCell[], id: string): number | undefined {
  let index = indexes.get(cells);
  if (!index) {
    const positions = new Map<string, number>();
    for (let position = 0; position < cells.length; position++) {
      positions.set(cells[position].id, position);
    }
    index = positions;
    indexes.set(cells, index);
  }
  return index.get(id);
}

export function getCellById<T extends IdentifiedCell>(cells: readonly T[], id: string): T | undefined {
  const position = getCellIndexById(cells, id);
  return position === undefined ? undefined : cells[position];
}
