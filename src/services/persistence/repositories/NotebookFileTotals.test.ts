import { expect, it } from 'vitest';
import { NotebookFileTotals } from './NotebookFileTotals';

it('derives totals from actual file sizes and preserves saturating decrements', () => {
  const totals = NotebookFileTotals.fromFiles([{ size: 6 }, { size: 0 }, { size: 4 }]);
  expect(totals.toRecord()).toEqual({ fileCount: 3, totalSize: 10 });
  expect(totals.adjust(-8, -20).toRecord()).toEqual({ fileCount: 0, totalSize: 0 });
  expect(totals.toRecord()).toEqual({ fileCount: 3, totalSize: 10 });
});

it.each([undefined, null, '4', NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects corrupt persisted size %j',
  (size) => {
    expect(() => NotebookFileTotals.fromFiles([{ size }])).toThrow('accounting');
  }
);

it('rejects accumulation and adjustment overflow', () => {
  expect(() =>
    NotebookFileTotals.fromFiles([{ size: Number.MAX_SAFE_INTEGER }, { size: 1 }])
  ).toThrow('accounting');
  expect(() => new NotebookFileTotals(Number.MAX_SAFE_INTEGER, 0).adjust(1, 0)).toThrow('overflow');
  expect(() => new NotebookFileTotals(0, Number.MAX_SAFE_INTEGER).adjust(0, 1)).toThrow('overflow');
});

it.each([NaN, Infinity, 0.5, '1', undefined])('rejects invalid adjustment %j', (delta) => {
  const totals = new NotebookFileTotals(1, 4);
  expect(() => totals.adjust(delta as number, 0)).toThrow('delta');
  expect(() => totals.adjust(0, delta as number)).toThrow('delta');
});
