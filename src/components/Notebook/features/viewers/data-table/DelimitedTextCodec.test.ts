import { expect, it } from 'vitest';
import { spreadsheetClipboardCodec as codec } from './DelimitedTextCodec';

it('round-trips quoted clipboard cells containing tabs, quotes and embedded line breaks', () => {
  const rows = [
    ['first\tfield', 'line one\nline two'],
    ['"quoted"', 'CR\r\nLF'],
    ['', ''],
  ];
  expect(codec.parse(codec.serialize(rows))).toEqual(rows);
});

it('preserves real blank rows while removing a synthetic terminal CRLF record', () => {
  expect(codec.parse('a\tb\r\n\r\nc\td\r\n')).toEqual([['a', 'b'], [''], ['c', 'd']]);
  expect(codec.parse(codec.serialize([[0, false, null, undefined]]))).toEqual([
    ['0', 'false', '', ''],
  ]);
});

it('distinguishes an empty clipboard from an explicitly copied blank cell and rejects malformed quoting', () => {
  expect(codec.parse('')).toEqual([]);
  expect(codec.parse(codec.serialize([['']]))).toEqual([['']]);
  expect(() => codec.parse('"unterminated')).toThrow('Invalid TSV');
});
