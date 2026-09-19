import { renderHook } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { expect, it } from 'vitest';
import { markdownEditorTheme, useMarkdownEditorExtensions } from './markdownEditorConfig';

it('keeps configuration identity stable until the boundary keymap changes', () => {
  const first = keymap.of([]);
  const second = keymap.of([]);
  const hook = renderHook(({ boundary }) => useMarkdownEditorExtensions(boundary), {
    initialProps: { boundary: first },
  });
  const original = hook.result.current;
  hook.rerender({ boundary: first });
  expect(hook.result.current).toBe(original);
  hook.rerender({ boundary: second });
  expect(hook.result.current).not.toBe(original);
  original.slice(0, -1).forEach((extension, index) => {
    expect(hook.result.current[index]).toBe(extension);
  });
  expect(hook.result.current[hook.result.current.length - 1]).toBe(second);
});

it('shares immutable extension definitions without sharing editor document state', () => {
  const { result } = renderHook(() => useMarkdownEditorExtensions(keymap.of([])));
  const extensions = [...result.current, markdownEditorTheme];
  const first = EditorState.create({ doc: '# First', extensions });
  const second = EditorState.create({ doc: '# Second', extensions });
  const edited = first.update({ changes: { from: 2, to: 7, insert: 'Changed' } }).state;
  expect(edited.doc.toString()).toBe('# Changed');
  expect(first.doc.toString()).toBe('# First');
  expect(second.doc.toString()).toBe('# Second');
});
