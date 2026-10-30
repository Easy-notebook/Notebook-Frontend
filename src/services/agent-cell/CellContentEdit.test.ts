import { describe, expect, it } from 'vitest';
import { CellContentEdit } from './CellContentEdit';

describe('Markdown insertion', () => {
  const cell = {
    type: 'markdown' as const,
    content: '# 方法\r\n\r\n第一段 **原文**。\r\n\r\n最后一段。',
  };
  it.each(['before', 'after'] as const)('preserves all source bytes %s the anchor', (position) => {
    const anchor = '**原文**';
    const offset = cell.content.indexOf(anchor) + (position === 'after' ? anchor.length : 0);
    const fragment = '补充 $x^2$';
    expect(new CellContentEdit(cell, { anchor, position }).apply(fragment)).toBe(
      cell.content.slice(0, offset) + fragment + cell.content.slice(offset)
    );
  });
  it('rejects missing, ambiguous and overlapping anchors', () => {
    expect(() => new CellContentEdit(cell, { anchor: 'missing', position: 'after' })).toThrow(
      'ANCHOR_NOT_FOUND'
    );
    expect(
      () =>
        new CellContentEdit(
          { ...cell, content: '重复 重复' },
          { anchor: '重复', position: 'after' }
        )
    ).toThrow('ANCHOR_AMBIGUOUS');
    expect(
      () => new CellContentEdit({ ...cell, content: 'aaa' }, { anchor: 'aa', position: 'after' })
    ).toThrow('ANCHOR_AMBIGUOUS');
  });
  it('rejects non-Markdown and excessive merged content', () => {
    expect(
      () => new CellContentEdit({ ...cell, type: 'code' }, { anchor: '方法', position: 'after' })
    ).toThrow('only in Markdown');
    expect(() =>
      new CellContentEdit(cell, { anchor: '方法', position: 'after' }).apply('x'.repeat(500_000))
    ).toThrow('CELL_TOO_LARGE');
  });
});
