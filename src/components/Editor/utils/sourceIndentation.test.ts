import { expect, it } from 'vitest';
import { indentSourceChange, indentSourceLines } from './sourceIndentation';

it('returns only the selected line range for transaction-based editing', () => {
  const prefix = 'unchanged\n'.repeat(10000);
  expect(
    indentSourceChange(prefix + 'target\nafter', prefix.length, prefix.length + 6, false)
  ).toEqual({
    from: prefix.length,
    to: prefix.length + 6,
    insert: '  target',
    start: prefix.length + 2,
    end: prefix.length + 8,
  });
});

it('indents selected lines and excludes the next line when selection ends at its start', () => {
  expect(indentSourceLines('a\nb\nc', 0, 4, false)).toEqual({
    value: '  a\n  b\nc',
    start: 2,
    end: 8,
  });
});
it('outdents spaces and tabs and clamps positions inside removed indentation', () => {
  expect(indentSourceLines('  a\n\tb\nc', 1, 6, true)).toEqual({
    value: 'a\nb\nc',
    start: 0,
    end: 3,
  });
});
it('indents the caret line and keeps the caret attached to its text', () => {
  expect(indentSourceLines('a\nb', 2, 2, false)).toEqual({ value: 'a\n  b', start: 4, end: 4 });
  expect(indentSourceLines('', 0, 0, false)).toEqual({ value: '  ', start: 2, end: 2 });
});
it('leaves unindented text unchanged when outdenting', () => {
  expect(indentSourceLines('a\nb', 0, 3, true)).toEqual({ value: 'a\nb', start: 0, end: 3 });
});
it('handles an empty leading line without moving into the next line', () => {
  expect(indentSourceLines('\na', 0, 0, false)).toEqual({ value: '  \na', start: 2, end: 2 });
});
