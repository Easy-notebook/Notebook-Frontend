import { expect, it } from 'vitest';
import { Schema, type Node } from '@tiptap/pm/model';
import { structuralBlockRanges } from './structuralBlockRanges';

const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    block: { attrs: { cellId: {} }, content: 'text*' },
    text: {},
  },
});
const block = (id: number) =>
  schema.nodes.block.create({ cellId: String(id) }, schema.text(String(id)));
function longestCommon(a: Node[], b: Node[]) {
  let previous = Array(b.length + 1).fill(0);
  for (const node of a) {
    const row = [0];
    for (let index = 0; index < b.length; index++)
      row.push(node.eq(b[index]) ? previous[index] + 1 : Math.max(previous[index + 1], row[index]));
    previous = row;
  }
  return previous[b.length];
}
it('matches minimal removed-block counts and reconstructs randomized edits', () => {
  let seed = 17;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let run = 0; run < 100; run++) {
    const current = Array.from({ length: 12 }, (_, index) => block(index));
    const next = current.filter(() => random() > 0.2);
    next.push(block(20 + run));
    for (let index = next.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [next[index], next[target]] = [next[target], next[index]];
    }
    const ranges = structuralBlockRanges(current, next);
    const rebuilt = [...current];
    for (const range of [...ranges].reverse())
      rebuilt.splice(
        range.start,
        range.oldEnd - range.start,
        ...next.slice(range.newStart, range.newEnd)
      );
    expect(rebuilt).toEqual(next);
    expect(
      current.length - ranges.reduce((sum, range) => sum + range.oldEnd - range.start, 0)
    ).toBe(longestCommon(current, next));
  }
});
it('moves one block across 10000 others using one insertion and one deletion', () => {
  const current = Array.from({ length: 10001 }, (_, index) => block(index));
  const next = [...current.slice(1), current[0]];
  const ranges = structuralBlockRanges(current, next);
  expect(ranges).toHaveLength(2);
  expect(ranges.reduce((sum, range) => sum + range.oldEnd - range.start, 0)).toBe(1);
});
