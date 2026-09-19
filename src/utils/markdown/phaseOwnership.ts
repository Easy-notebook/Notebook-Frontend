import type { Task } from '@Store/models/task';

/** Union-by-rank successor index: each component ends at its next unassigned cell. */
class UnassignedCells {
  private readonly parents: Uint32Array;
  private readonly ends: Uint32Array;
  private readonly ranks: Uint8Array;

  constructor(count: number) {
    this.parents = new Uint32Array(count + 1);
    this.ends = new Uint32Array(count + 1);
    this.ranks = new Uint8Array(count + 1);
    for (let index = 0; index <= count; index++) this.parents[index] = this.ends[index] = index;
  }

  private root(index: number): number {
    while (this.parents[index] !== index) {
      this.parents[index] = this.parents[this.parents[index]];
      index = this.parents[index];
    }
    return index;
  }

  next(index: number): number {
    return this.ends[this.root(index)];
  }

  remove(index: number): number {
    let left = this.root(index);
    let right = this.root(index + 1);
    if (left !== right) {
      if (this.ranks[left] < this.ranks[right]) [left, right] = [right, left];
      this.parents[right] = left;
      this.ends[left] = Math.max(this.ends[left], this.ends[right]);
      if (this.ranks[left] === this.ranks[right]) this.ranks[left]++;
    }
    return this.ends[left];
  }
}

/** Last range wins; every covered cell is assigned once, even with fully overlapping ranges. */
export function resolvePhaseOwnership(count: number, tasks: readonly Task[]): (string | null)[] {
  const assignments: (string | null)[] = new Array(count).fill(null);
  if (!count || !tasks.length) return assignments;
  const available = new UnassignedCells(count);
  for (let taskIndex = tasks.length - 1; taskIndex >= 0; taskIndex--) {
    const phases = tasks[taskIndex].phases;
    for (let phaseIndex = phases.length - 1; phaseIndex >= 0; phaseIndex--) {
      const phase = phases[phaseIndex];
      for (let stepIndex = phase.steps.length - 1; stepIndex >= 0; stepIndex--) {
        const { startIndex: start, endIndex: end } = phase.steps[stepIndex];
        if (
          typeof start !== 'number' ||
          typeof end !== 'number' ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end)
        )
          continue;
        const stop = Math.max(0, Math.min(count, end + 1));
        let index = available.next(Math.max(0, Math.min(count, start)));
        while (index < stop) {
          assignments[index] = phase.id;
          index = available.remove(index);
        }
      }
    }
  }
  return assignments;
}
