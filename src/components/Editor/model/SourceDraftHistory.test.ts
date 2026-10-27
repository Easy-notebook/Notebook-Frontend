import { expect, it } from 'vitest';
import { SourceDraftHistory, type SourceDraftChange } from './SourceDraftHistory';
import { NotebookSourceDocument } from './NotebookSourceDocument';

it('restores a JSON history checkpoint including backward selection and redo branches', () => {
  const draft = new SourceDraftHistory('中文🐍');
  draft.select(0, 2, true);
  draft.replace(0, 2, 'updated', 7, 7);
  draft.replace(7, 7, '\nnext', 12, 12);
  draft.step(true);
  draft.select(0, 7, true);
  const restored = SourceDraftHistory.restore(JSON.parse(JSON.stringify(draft.checkpoint())));
  expect(restored.source).toBe(draft.source);
  expect([restored.selection.anchor, restored.selection.head]).toEqual([7, 0]);
  expect(restored.canUndo).toBe(true);
  expect(restored.canRedo).toBe(true);
  expect(restored.step(false)).toBe(true);
  expect(restored.source).toBe('updated\nnext🐍');
  expect(restored.step(true)).toBe(true);
  expect(restored.step(true)).toBe(true);
  expect(restored.source).toBe('中文🐍');
  expect([restored.selection.anchor, restored.selection.head]).toEqual([2, 0]);
  restored.replace(0, 2, 'branch', 6, 6);
  expect(restored.canRedo).toBe(false);
  expect(draft.source).toBe('updated🐍');
});

it('rejects unsupported checkpoint versions and invalid editor state', () => {
  expect(() => SourceDraftHistory.restore({ version: 2, state: {} } as any)).toThrow('Unsupported');
  expect(() => SourceDraftHistory.restore({ version: 1, state: { doc: 12 } })).toThrow();
});

it('retains a bounded event window and preserves source cell identities across trimming and branching', () => {
  const document = new NotebookSourceDocument([]);
  const draft = new SourceDraftHistory(document.source);
  const identities: string[] = [];
  for (let index = 0; index < 300; index++) {
    const previousLength = draft.source.length;
    const insertion = document.appendCell(draft.source, index % 2 ? 'code' : 'raw');
    draft.replace(
      previousLength,
      previousLength,
      insertion.source.slice(previousLength),
      insertion.cursor,
      insertion.cursor
    );
    const decoded = document.decode(draft.source);
    expect(decoded.map((cell) => cell.id).slice(0, -1)).toEqual(identities);
    identities.push(decoded[decoded.length - 1].id);
  }
  let undone = 0;
  while (draft.step(true)) {
    undone++;
    expect(document.decode(draft.source).map((cell) => cell.id)).toEqual(
      identities.slice(0, -undone)
    );
  }
  // CodeMirror retains 100 events plus a small amortized-trimming margin.
  // This bounds event count only, not the bytes retained by a large edit.
  expect(undone).toBeGreaterThanOrEqual(100);
  expect(undone).toBeLessThanOrEqual(122);
  const retainedBase = 300 - undone;
  for (let index = 1; index <= undone; index++) {
    expect(draft.step(false)).toBe(true);
    expect(document.decode(draft.source).map((cell) => cell.id)).toEqual(
      identities.slice(0, retainedBase + index)
    );
  }
  expect(draft.step(false)).toBe(false);
  expect(draft.step(true)).toBe(true);
  const branchBase = draft.source;
  const insertion = document.appendCell(branchBase, 'markdown');
  draft.replace(
    branchBase.length,
    branchBase.length,
    insertion.source.slice(branchBase.length),
    insertion.cursor,
    insertion.cursor
  );
  const branched = document.decode(draft.source);
  expect(branched.slice(0, -1).map((cell) => cell.id)).toEqual(identities.slice(0, -1));
  expect(identities).not.toContain(branched[branched.length - 1].id);
  expect(draft.canRedo).toBe(false);
  expect(draft.step(true)).toBe(true);
  expect(draft.source).toBe(branchBase);
  expect(draft.step(false)).toBe(true);
  expect(document.decode(draft.source)).toEqual(branched);
});

it('reconstructs randomized Unicode and multiline history using only published ranges', () => {
  let seed = 1729;
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const inserts = ['', 'x', '\n', '中文', '🐍', 'first\nsecond'];
  for (let run = 0; run < 30; run++) {
    const draft = new SourceDraftHistory('start\n中文🐍\nend');
    const snapshots = [draft.source];
    for (let edit = 0; edit < 30; edit++) {
      const before = draft.source;
      const from = random(before.length + 1);
      const to = from + random(before.length - from + 1);
      const insert = inserts[random(inserts.length)];
      draft.select(from, to, !!random(2));
      draft.replace(from, to, insert, from + insert.length, from + insert.length);
      if (draft.source !== before) snapshots.push(draft.source);
    }
    let mirror = draft.source;
    let calls = 0;
    const apply = (changes: readonly SourceDraftChange[]) => {
      calls++;
      for (let index = changes.length - 1; index >= 0; index--) {
        const { from, to, insert } = changes[index];
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(mirror.length);
        mirror = mirror.slice(0, from) + insert + mirror.slice(to);
      }
      expect(mirror).toBe(draft.source);
      expect(draft.selection.to).toBeLessThanOrEqual(mirror.length);
    };
    for (let index = snapshots.length - 2; index >= 0; index--) {
      expect(draft.step(true, apply)).toBe(true);
      expect(mirror).toBe(snapshots[index]);
    }
    const undoCalls = calls;
    expect(draft.step(true, apply)).toBe(false);
    expect(calls).toBe(undoCalls);
    for (let index = 1; index < snapshots.length; index++) {
      expect(draft.step(false, apply)).toBe(true);
      expect(mirror).toBe(snapshots[index]);
    }
    expect(calls).toBe(undoCalls * 2);
    expect(draft.step(false, apply)).toBe(false);
    expect(calls).toBe(undoCalls * 2);
  }
});

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
