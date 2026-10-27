import { expect, it } from 'vitest';
import { indentSourceChange } from './sourceIndentation';

// Apply the descriptor to verify text and selection together without a production snapshot adapter.
function indentSourceLines(value: string, start: number, end: number, outdent: boolean) {
  const edit = indentSourceChange(value, start, end, outdent);
  return {
    value: value.slice(0, edit.from) + edit.insert + value.slice(edit.to),
    start: edit.start,
    end: edit.end,
  };
}

it('represents caret indentation as a prefix-only edit even on a very long line', () => {
  const value = 'prefix\n' + 'x'.repeat(100000);
  expect(indentSourceChange(value, 7, 7, false)).toEqual({
    from: 7,
    to: 7,
    insert: '  ',
    start: 9,
    end: 9,
  });
  expect(indentSourceChange('  ' + value, 1, 1, true)).toEqual({
    from: 0,
    to: 2,
    insert: '',
    start: 0,
    end: 0,
  });
});

it('does not copy the unselected tail of a long line when indenting a short selection', () => {
  expect(indentSourceChange('x'.repeat(100000), 0, 1, false)).toEqual({
    from: 0,
    to: 1,
    insert: '  x',
    start: 2,
    end: 3,
  });
});

it('removes the full indentation when the selection ends inside it without copying the line tail', () => {
  expect(indentSourceChange('  ' + 'x'.repeat(100000), 0, 1, true)).toEqual({
    from: 0,
    to: 2,
    insert: '',
    start: 0,
    end: 0,
  });
});

it('maps both endpoints across lines when outdent extends past the selected final prefix', () => {
  expect(indentSourceLines('  a\n  tail', 1, 5, true)).toEqual({
    value: 'a\ntail',
    start: 0,
    end: 2,
  });
  expect(indentSourceLines('a\ntail', 0, 3, false)).toEqual({
    value: '  a\n  tail',
    start: 2,
    end: 7,
  });
});

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
