import { expect, it, vi } from 'vitest';
import { SpreadsheetStructureChange } from './SpreadsheetStructureChange';
import { SpreadsheetHistory } from './SpreadsheetHistory';
import type { SpreadsheetSnapshot } from './SpreadsheetSnapshot';

function source(): SpreadsheetSnapshot {
  return {
    data: [
      { A: 'Ada', B: 0 },
      { A: 'Grace', B: false },
    ],
    columns: [
      { key: 'A', displayName: 'A', width: 120, type: 'string' },
      { key: 'B', displayName: 'B', width: 140, type: 'mixed' },
    ],
    cellFormats: { '0:0': { bold: true }, '1:1': { color: '#ff0000' } },
  };
}

it.each(['row', 'column'] as const)(
  'inserts %s data and formats together and reverses the transformation',
  (axis) => {
    const original = new SpreadsheetHistory(source(), vi.fn()).getSnapshot().value;
    const insert = new SpreadsheetStructureChange(axis, 'insert', 0);
    const added = insert.apply(original);
    expect(added.cellFormats[axis === 'row' ? '1:0' : '0:1']).toEqual({ bold: true });
    expect(added.cellFormats[axis === 'row' ? '2:1' : '1:2']).toEqual({ color: '#ff0000' });
    expect(insert.mapIndex(0)).toBe(1);
    expect(new SpreadsheetStructureChange(axis, 'delete', 0).apply(added)).toEqual(original);
    expect(original).toEqual(source());
  }
);

it.each(['row', 'column'] as const)(
  'drops deleted %s formats and shifts surviving formats',
  (axis) => {
    const change = new SpreadsheetStructureChange(axis, 'delete', 0);
    const result = change.apply(source());
    expect(change.mapIndex(0)).toBeNull();
    expect(result.cellFormats).toEqual({ [axis === 'row' ? '0:1' : '1:0']: { color: '#ff0000' } });
    if (axis === 'column') {
      expect(result.data).toEqual([{ A: 0 }, { A: false }]);
      expect(result.columns[0]).toMatchObject({ key: 'A', width: 140, type: 'mixed' });
    }
  }
);

it('rejects out-of-range edits before altering the source snapshot', () => {
  const original = source();
  for (const index of [-1, 3, 1.5, NaN]) {
    expect(() => new SpreadsheetStructureChange('row', 'delete', index).apply(original)).toThrow(
      'Invalid structural edit position'
    );
  }
  expect(original).toEqual(source());
});
