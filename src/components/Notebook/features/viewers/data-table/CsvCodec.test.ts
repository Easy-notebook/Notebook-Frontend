import Papa from 'papaparse';
import { expect, it } from 'vitest';
import { parseTableCsv, serializeTableCsv } from './CsvCodec';

it('round-trips delimiters, quotes, newlines, whitespace and Unicode without synthetic headers', () => {
  const cells = [
    ['name, label', 'quote"label', 'notes'],
    ['中文', 'line\r\nbreak', ' embedded\rreturn '],
    ['comma,value', 'He said "hello"', 'line\nbreak'],
  ];
  const columns = [{ key: 'A' }, { key: 'B' }, { key: 'C' }];
  const rows = cells.map(([A, B, C]) => ({ A, B, C }));
  const encoded = serializeTableCsv(rows, columns);
  const parsed = Papa.parse<string[]>(encoded);
  expect(parsed.errors).toEqual([]);
  expect(parsed.data).toEqual(cells);
  const savedAgain = serializeTableCsv(
    parsed.data.map(([A, B, C]) => ({ A, B, C })),
    columns
  );
  expect(savedAgain).toBe(encoded);
});

it('uses column keys and their displayed order, preserving zero, false and missing cells', () => {
  const encoded = serializeTableCsv(
    [{ A: 0, B: false, C: null, D: undefined, hidden: 'not exported' }],
    [{ key: 'B' }, { key: 'A' }, { key: 'C' }, { key: 'D' }]
  );
  expect(encoded).toBe('false,0,"",""');
});

it('does not fabricate data for an empty table', () => {
  expect(serializeTableCsv([], [{ key: 'A' }])).toBe('');
});

it.each([
  ['', []],
  [' ', [[' ']]],
  ['a\n', [['a']]],
  ['a\n\n', [['a'], ['']]],
  ['\n', [['']]],
  ['\r\n\r\n', [[''], ['']]],
  ['a\n\nb', [['a'], [''], ['b']]],
  ['"line\nbreak"\n""', [['line\nbreak'], ['']]],
] as const)('preserves CSV records for %j', (content, expected) => {
  expect(parseTableCsv(content)).toEqual(expected);
  const encoded = serializeTableCsv(
    expected.map((row) => ({ A: row[0] })),
    [{ key: 'A' }]
  );
  expect(parseTableCsv(encoded)).toEqual(expected);
});

it('reports malformed quoted cells instead of silently saving partial data', () => {
  expect(() => parseTableCsv('"unterminated')).toThrow('Invalid CSV');
});
