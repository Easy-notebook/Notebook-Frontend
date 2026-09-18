import { describe, expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { cellsChanged, reconcileCells } from './reconcileCells';

const cell = (id: string, type: Cell['type'], content: string): Cell => ({
  id,
  type,
  content,
  outputs: [],
});

describe('reconcileCells', () => {
  it('keeps store-owned execution data when document order changes', () => {
    const code = { ...cell('code', 'code', 'print(1)'), outputs: [{ type: 'text', content: '1' }] };
    const markdown = { ...cell('note', 'markdown', 'old'), metadata: { phaseId: 'phase-1' } };
    const result = reconcileCells(
      [cell('note', 'markdown', 'new'), cell('code', 'code', '')],
      [code, markdown]
    );

    expect(result.map((item) => item.id)).toEqual(['note', 'code']);
    expect(result[0]).toMatchObject({ content: 'new', metadata: { phaseId: 'phase-1' } });
    expect(result[1]).toBe(code);
  });

  it('preserves identity for unchanged cells and detects structural changes', () => {
    const stored = [cell('a', 'markdown', 'a'), cell('b', 'raw', 'b')];
    const same = reconcileCells(
      stored.map(({ ...item }) => item),
      stored
    );
    expect(cellsChanged(same, stored)).toBe(false);
    expect(cellsChanged([same[1], same[0]], stored)).toBe(true);
  });
});
