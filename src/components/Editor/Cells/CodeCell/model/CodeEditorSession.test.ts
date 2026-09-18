import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { history, undo, redo, undoDepth } from '@codemirror/commands';
import { codeFolding, foldEffect, foldedRanges } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { CodeEditorSession } from './CodeEditorSession';

function capture(state: EditorState, height = 120) {
  const session = new CodeEditorSession();
  session.capture({
    state,
    dom: { getBoundingClientRect: () => ({ height }) },
    scrollDOM: { scrollTop: 20, scrollLeft: 10 },
  } as unknown as EditorView);
  return session;
}
describe('suspended code editor state', () => {
  it('retains exact measured height even for compact code editors', () => {
    expect(capture(EditorState.create({ doc: 'print(1)' }), 24.796875).height).toBe(24.796875);
  });
  it('restores document, selection, folds, undo and redo in a fresh configuration', () => {
    let state = EditorState.create({
      doc: 'abc\ndef\nghi',
      extensions: [history(), codeFolding()],
    });
    state = state.update({
      changes: { from: 1, insert: 'X' },
      selection: { anchor: 2 },
      effects: foldEffect.of({ from: 4, to: 8 }),
    }).state;
    const session = capture(state);
    const snapshot = session.initialState(state.doc.toString())!;
    state = EditorState.fromJSON(
      snapshot.json,
      { extensions: [history(), codeFolding()] },
      snapshot.fields
    );
    expect(state.selection.main.anchor).toBe(2);
    expect(foldedRanges(state).size).toBe(1);
    expect(session.height).toBe(120);
    expect(
      undo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      })
    ).toBe(true);
    expect(state.doc.toString()).toBe('abc\ndef\nghi');
    expect(
      redo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      })
    ).toBe(true);
    expect(state.doc.toString()).toBe('aXbc\ndef\nghi');
  });
  it('rebases external changes without adding them to undo history', () => {
    let state = EditorState.create({ doc: 'hello world', extensions: [history()] });
    state = state.update({ changes: { from: 0, insert: 'X' } }).state;
    const session = capture(state);
    const snapshot = session.initialState('Xhello world!')!;
    state = EditorState.fromJSON(snapshot.json, { extensions: [history()] }, snapshot.fields);
    expect(undoDepth(state)).toBe(1);
    expect(
      undo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      })
    ).toBe(true);
    expect(state.doc.toString()).toBe('hello world!');
  });
});
