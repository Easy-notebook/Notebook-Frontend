import { expect, it } from 'vitest';
import { SourceDraftHistory } from './SourceDraftHistory';

it('does not split typing for unchanged selection notifications or record caret-only undo', () => {
  const draft = new SourceDraftHistory('a');
  draft.select(1, 1);
  expect(draft.canUndo).toBe(false);
  draft.replace(1, 1, 'b', 2, 2, false, false);
  draft.select(2, 2);
  draft.replace(2, 2, 'c', 3, 3, false, false);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('a');
  expect(draft.canUndo).toBe(false);
});

it('starts a new typing group after an explicit caret move', () => {
  const draft = new SourceDraftHistory('a');
  draft.select(1, 1);
  draft.replace(1, 1, 'bc', 3, 3, false, false);
  draft.select(2, 2);
  draft.replace(2, 2, 'X', 3, 3, false, false);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('abc');
  expect(draft.selection.head).toBe(2);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('a');
});

it('isolates a native selection replacement whose diff retains a common prefix', () => {
  const draft = new SourceDraftHistory('a');
  draft.edit('abc', 3, 3);
  draft.select(1, 3, true);
  draft.edit('abX', 3, 3);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('abc');
  expect([draft.selection.anchor, draft.selection.head]).toEqual([3, 1]);
  expect(draft.step(false)).toBe(true);
  expect(draft.source).toBe('abX');
});

it('undoes typing over a selected range independently of preceding and following typing', () => {
  const draft = new SourceDraftHistory('a');
  draft.select(1, 1);
  draft.replace(1, 1, 'bc', 3, 3, false, false);
  draft.select(1, 3, true);
  draft.replace(1, 3, 'X', 2, 2, false, false);
  draft.replace(2, 2, 'Y', 3, 3, false, false);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('aX');
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('abc');
  expect([draft.selection.anchor, draft.selection.head]).toEqual([3, 1]);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('a');
});

it('groups consecutive backward deletions separately from typing on either side', () => {
  const draft = new SourceDraftHistory('a');
  draft.select(1, 1);
  draft.edit('ab', 2, 2);
  draft.edit('abc', 3, 3);
  draft.edit('ab', 2, 2);
  draft.edit('a', 1, 1);
  draft.edit('ax', 2, 2);
  draft.edit('axy', 3, 3);
  for (const expected of ['a', 'abc', 'a']) {
    expect(draft.step(true)).toBe(true);
    expect(draft.source).toBe(expected);
  }
  expect(draft.canUndo).toBe(false);
  for (const expected of ['abc', 'a', 'axy']) {
    expect(draft.step(false)).toBe(true);
    expect(draft.source).toBe(expected);
  }
});

it('separates typing from a subsequent selection deletion in undo history', () => {
  const draft = new SourceDraftHistory('hello');
  draft.select(5, 5);
  draft.replace(5, 5, '!', 6, 6, false, false);
  draft.select(5, 6);
  draft.replace(5, 6, '', 5, 5, false, false);
  expect(draft.source).toBe('hello');
  draft.replace(5, 5, '?', 6, 6, false, false);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('hello');
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('hello!');
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('hello');
  expect(draft.step(false)).toBe(true);
  expect(draft.source).toBe('hello!');
  expect(draft.step(false)).toBe(true);
  expect(draft.source).toBe('hello');
  expect(draft.step(false)).toBe(true);
  expect(draft.source).toBe('hello?');
});

it('does not add an undo entry for an unchanged known-range replacement', () => {
  const draft = new SourceDraftHistory('text');
  draft.replace(0, 4, 'text', 0, 4, true);
  expect(draft.canUndo).toBe(false);
  expect(draft.selection.anchor).toBe(4);
});

it('applies known-range additions without changing the existing large prefix', () => {
  const original = 'unchanged line\n'.repeat(10000);
  const draft = new SourceDraftHistory(original);
  draft.select(original.length, original.length);
  draft.replace(
    original.length,
    original.length,
    'added',
    original.length + 5,
    original.length + 5
  );
  expect(draft.source).toBe(original + 'added');
  draft.step(true);
  expect(draft.source).toBe(original);
  expect(draft.selection.head).toBe(original.length);
  draft.step(false);
  expect(draft.source).toBe(original + 'added');
});

it('undoes isolated changes with their directional selections and supports redo', () => {
  const draft = new SourceDraftHistory('a\nb');
  draft.select(0, 3, true);
  draft.edit('  a\n  b', 2, 7, true, true);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe('a\nb');
  expect([draft.selection.anchor, draft.selection.head]).toEqual([3, 0]);
  expect(draft.step(false)).toBe(true);
  expect(draft.source).toBe('  a\n  b');
  expect([draft.selection.anchor, draft.selection.head]).toEqual([7, 2]);
});

it('invalidates redo after a new edit and ignores unchanged text', () => {
  const draft = new SourceDraftHistory('中文🐍');
  draft.edit('中文🐍!', 5, 5, false, true);
  draft.step(true);
  draft.edit('中文🐍?', 5, 5, false, true);
  expect(draft.step(false)).toBe(false);
  draft.edit(draft.source, 0, 0);
  draft.step(true);
  expect(draft.source).toBe('中文🐍');
});
