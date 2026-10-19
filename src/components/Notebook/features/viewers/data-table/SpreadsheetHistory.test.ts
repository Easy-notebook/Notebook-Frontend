import { expect, it, vi } from 'vitest';
import { SpreadsheetHistory } from './SpreadsheetHistory';
import { SpreadsheetEditSession } from './SpreadsheetEditSession';

it('undoes and redoes complete snapshots and drops the old redo branch on edit', () => {
  const history = new SpreadsheetHistory({ cells: ['initial'], columns: ['A'] }, vi.fn());
  history.commit({ cells: ['first'], columns: ['A', 'B'] });
  history.commit({ cells: ['second'], columns: ['A', 'B'] });
  expect(history.undo()).toBe(true);
  expect(history.getSnapshot().value).toEqual({ cells: ['first'], columns: ['A', 'B'] });
  expect(history.redo()).toBe(true);
  expect(history.getSnapshot().value.cells).toEqual(['second']);
  history.undo();
  history.commit({ cells: ['branch'], columns: ['C'] });
  expect(history.getSnapshot().canRedo).toBe(false);
  expect(history.redo()).toBe(false);
});

it('isolates stored history from caller mutation and freezes published snapshots', () => {
  const history = new SpreadsheetHistory({ cells: [{ text: 'initial' }] }, vi.fn());
  const next = { cells: [{ text: 'next' }] };
  history.commit(next);
  next.cells[0].text = 'mutated caller';
  expect(history.getSnapshot().value.cells[0].text).toBe('next');
  expect(() => {
    history.getSnapshot().value.cells[0].text = 'mutated reader';
  }).toThrow();
  history.undo();
  expect(history.getSnapshot().value.cells[0].text).toBe('initial');
});

it('bounds undo while preserving the latest committed snapshot and resets even to an empty document', () => {
  const history = new SpreadsheetHistory({ cells: [0] }, vi.fn(), 2);
  for (const value of [1, 2, 3]) history.commit({ cells: [value] });
  expect(history.undo()).toBe(true);
  expect(history.undo()).toBe(true);
  expect(history.getSnapshot().value.cells).toEqual([1]);
  expect(history.undo()).toBe(false);
  history.reset({ cells: [] });
  expect(history.getSnapshot()).toEqual({ value: { cells: [] }, canUndo: false, canRedo: false });
  history.commit({ cells: [4] });
  history.undo();
  expect(history.getSnapshot().value.cells).toEqual([]);
});

it('revokes a pending save before publishing an edit or undo to observers', () => {
  const session = new SpreadsheetEditSession();
  session.receiveSource('file', 'initial');
  const history = new SpreadsheetHistory('initial', () => session.changed());
  const first = session.beginSave('first');
  let acknowledged = true;
  const unsubscribe = history.subscribe(() => {
    acknowledged = session.completeSave(first, 'first');
  });
  history.commit('newer');
  expect(acknowledged).toBe(false);
  unsubscribe();
  const second = session.beginSave('newer');
  history.undo();
  expect(session.completeSave(second, 'newer')).toBe(false);
});

it('does not notify or invalidate work for unavailable undo/redo', () => {
  const changed = vi.fn();
  const history = new SpreadsheetHistory('initial', changed);
  const listener = vi.fn();
  history.subscribe(listener);
  expect(history.undo()).toBe(false);
  expect(history.redo()).toBe(false);
  expect(changed).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
});
