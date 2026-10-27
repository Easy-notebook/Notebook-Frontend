import { expect, it } from 'vitest';
import { SpreadsheetSearch } from './SpreadsheetSearch';
import { SpreadsheetHistory } from './SpreadsheetHistory';
import type { SpreadsheetSnapshot } from './SpreadsheetSnapshot';

function source(): SpreadsheetSnapshot {
  return {
    data: [
      { A: 'A.b A.b', B: 0 },
      { A: 'a.B', B: false },
    ],
    columns: [
      { key: 'A', displayName: 'A', type: 'string', width: 100 },
      { key: 'B', displayName: 'B', type: 'mixed', width: 100 },
    ],
    cellFormats: { '0:0': { bold: true } },
  };
}
it('matches literal queries and treats replacement dollar sequences as literal text', () => {
  const history = new SpreadsheetHistory(source(), () => {});
  const search = new SpreadsheetSearch(history.getSnapshot().value, {
    text: 'a.b',
    matchCase: false,
    wholeCell: false,
  });
  expect(search.matches).toEqual([
    { row: 0, col: 0 },
    { row: 1, col: 0 },
  ]);
  const next = search.replace('$&');
  expect(next?.data).toEqual([
    { A: '$& $&', B: 0 },
    { A: '$&', B: false },
  ]);
  expect(history.getSnapshot().value).toEqual(source());
  expect(next?.cellFormats).toEqual(source().cellFormats);
});
it('uses current snapshot matches after replacement and undo', () => {
  const history = new SpreadsheetHistory(source(), () => {});
  const query = { text: 'a.b', matchCase: false, wholeCell: true };
  const search = new SpreadsheetSearch(history.getSnapshot().value, query);
  history.commit(search.replace('done', 0)!);
  expect(new SpreadsheetSearch(history.getSnapshot().value, query).matches).toEqual([]);
  history.undo();
  expect(new SpreadsheetSearch(history.getSnapshot().value, query).matches).toEqual([
    { row: 1, col: 0 },
  ]);
});
it('does not create edits for no matches, identical replacement or invalid selection', () => {
  const data = source();
  const search = new SpreadsheetSearch(data, { text: '0', matchCase: true, wholeCell: true });
  expect(search.replace('0')).toBeNull();
  expect(search.replace('new', -1)).toBeNull();
  expect(
    new SpreadsheetSearch(data, { text: '', matchCase: false, wholeCell: false }).replace('new')
  ).toBeNull();
});

it('captures query options and uses exact whole-cell boundaries including trailing newlines', () => {
  const data = source();
  data.data[0].A = 'Ada\n';
  data.data[1].A = 'Ada';
  const query = { text: 'Ada', matchCase: true, wholeCell: true };
  const search = new SpreadsheetSearch(data, query);
  query.wholeCell = false;
  expect(search.matches).toEqual([{ row: 1, col: 0 }]);
  expect(search.replace('Grace')?.data[0].A).toBe('Ada\n');
});
