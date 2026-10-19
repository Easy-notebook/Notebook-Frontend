import { expect, it } from 'vitest';
import { transformSpreadsheetFormula } from './SpreadsheetFormula';

it.each([
  ['A1+$A$2+A$3+$B4', 'A1+$A$3+A$4+$B5'],
  ['SUM(A1:B3)', 'SUM(A1:B4)'],
  ['SUM($1:$3)+SUM(A:C)', 'SUM($1:$4)+SUM(A:C)'],
  ['"A2"&A2&"escaped ""A2"""', '"A2"&A3&"escaped ""A2"""'],
  ['LOG10(A2)+Table1[[A2]:[B3]]+A2_name+1E10', 'LOG10(A3)+Table1[[A2]:[B3]]+A2_name+1E10'],
  ["Main!A2+Other!A2+'Main'!$B$2", "Main!A3+Other!A2+'Main'!$B$3"],
  ["'[1]Main'!A2+[1]Main!A2+Main:Other!A2", "'[1]Main'!A2+[1]Main!A2+Main:Other!A2"],
  ['XFD1048576+XFE2', '#REF!+XFE2'],
  ['@A2+A2#', '@A3+A3#'],
])('inserts a row in %s without rewriting non-reference tokens', (input, expected) => {
  expect(
    transformSpreadsheetFormula(input, 'Main', 'Main', { axis: 'row', kind: 'insert', index: 1 })
  ).toBe(expected);
});

it.each([
  ['A2+A3', '#REF!+A2'],
  ['SUM(A2:A4)', 'SUM(A2:A3)'],
  ['SUM(A2 : A4)', 'SUM(A2:A3)'],
  ['SUM(A1:A2)', 'SUM(A1:A1)'],
  ['SUM(A2:B2)', 'SUM(#REF!)'],
  ['SUM(A4:A2)', 'SUM(A3:A2)'],
  ['SUM(2:2)', 'SUM(#REF!)'],
])('shrinks ranges and invalidates deleted references in %s', (input, expected) => {
  expect(
    transformSpreadsheetFormula(input, 'Main', 'Main', { axis: 'row', kind: 'delete', index: 1 })
  ).toBe(expected);
});

it('shifts absolute column references on structural changes and shrinks whole-column ranges', () => {
  expect(
    transformSpreadsheetFormula('$B$3+SUM(A:C)+SUM(1:3)', 'Main', 'Main', {
      axis: 'column',
      kind: 'delete',
      index: 1,
    })
  ).toBe('#REF!+SUM(A:B)+SUM(1:3)');
});

it('only changes references to the edited sheet in formulas on other worksheets', () => {
  expect(
    transformSpreadsheetFormula("A2+'O''Brien'!A2+'Other'!A2", 'Other', "O'Brien", {
      axis: 'row',
      kind: 'insert',
      index: 1,
    })
  ).toBe("A2+'O''Brien'!A3+'Other'!A2");
});
