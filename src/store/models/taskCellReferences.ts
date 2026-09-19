import type { Cell } from './cell';
import type { Task } from './task';
import { getCellById } from './cellIndex';
import { isDraft, original } from 'immer';

/** Refresh content references in an Immer draft after a proven non-structural edit. */
export function replaceTaskCellReferences(tasks: Task[], replacement: Cell): void {
  mapTaskCellReferences(tasks, (cell) => (cell.id === replacement.id ? replacement : cell));
}

/** Bind newly derived tasks to the final immutable publication, not temporary normalization copies. */
export function bindTaskCellReferences(tasks: Task[], cells: readonly Cell[]): void {
  mapTaskCellReferences(tasks, (cell) => getCellById(cells, cell.id) ?? cell);
}

function mapTaskCellReferences(tasks: Task[], resolve: (cell: Cell) => Cell): void {
  const replace = (cells: Cell[] | undefined) => {
    if (!cells) return;
    for (let index = 0; index < cells.length; index++) {
      const replacement = resolve(cells[index]);
      const current = cells[index];
      if (current !== replacement && (!isDraft(current) || original(current) !== replacement)) {
        cells[index] = replacement;
      }
    }
  };
  for (const task of tasks) {
    for (const phase of task.phases) {
      replace(phase.intro);
      for (const step of phase.steps) replace(step.content);
    }
  }
}
