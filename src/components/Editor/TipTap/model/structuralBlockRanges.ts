import type { Node } from '@tiptap/pm/model';

export interface BlockReplacementRange {
  start: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

/** Maximize retained equal, ID-addressed blocks using LIS; O(n log n) time and O(n) space. */
export function structuralBlockRanges(
  current: readonly Node[],
  next: readonly Node[]
): BlockReplacementRange[] {
  const positions = new Map<string, number>();
  for (let index = 0; index < current.length; index++) {
    const id = current[index].attrs.cellId;
    if (typeof id !== 'string' || !id) continue;
    if (positions.has(id)) throw new Error('Duplicate current block identity');
    positions.set(id, index);
  }
  const candidates: { old: number; next: number }[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < next.length; index++) {
    const id = next[index].attrs.cellId;
    if (typeof id !== 'string' || !id) continue;
    if (seen.has(id)) throw new Error('Duplicate next block identity');
    seen.add(id);
    const old = positions.get(id);
    if (old !== undefined && current[old].eq(next[index])) candidates.push({ old, next: index });
  }
  const tails: number[] = [];
  const previous = new Int32Array(candidates.length).fill(-1);
  candidates.forEach((candidate, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (candidates[tails[middle]].old < candidate.old) low = middle + 1;
      else high = middle;
    }
    if (low) previous[index] = tails[low - 1];
    tails[low] = index;
  });
  const anchors: typeof candidates = [];
  for (let index = tails.length ? tails[tails.length - 1] : -1; index >= 0; index = previous[index])
    anchors.push(candidates[index]);
  anchors.reverse();
  anchors.push({ old: current.length, next: next.length });
  const ranges: BlockReplacementRange[] = [];
  let oldStart = 0;
  let newStart = 0;
  for (const anchor of anchors) {
    if (oldStart !== anchor.old || newStart !== anchor.next)
      ranges.push({ start: oldStart, oldEnd: anchor.old, newStart, newEnd: anchor.next });
    oldStart = anchor.old + 1;
    newStart = anchor.next + 1;
  }
  return ranges;
}
