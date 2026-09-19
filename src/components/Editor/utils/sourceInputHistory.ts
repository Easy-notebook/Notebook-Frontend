import type { KeyboardEvent } from 'react';
import type { Editor } from '@tiptap/core';
import { isCompositionInput } from './compositionInput';
import { indentSourceLines } from './sourceIndentation';
import { closeHistory } from '@tiptap/pm/history';

/** Source text is stored in document transactions; use that same undo history. */
export function handleSourceInputHistory(
  event: KeyboardEvent<HTMLTextAreaElement>,
  editor: Editor,
  updateSource?: (source: string) => void
) {
  event.stopPropagation();
  if (!editor.isEditable || isCompositionInput(event.nativeEvent) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (updateSource && (event.ctrlKey || event.metaKey) && (key === '[' || key === ']')) {
    event.preventDefault();
    const input = event.currentTarget;
    const edit = indentSourceLines(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      key === '['
    );
    if (edit.value === input.value) return;
    const direction = input.selectionDirection;
    editor.view.dispatch(closeHistory(editor.state.tr));
    // Update the native input before publishing its controlled value. React then
    // sees matching text and retains this selection; no deferred caret write can
    // overwrite a later keypress, click, or undo.
    input.setRangeText(edit.value, 0, input.value.length, 'preserve');
    input.setSelectionRange(edit.start, edit.end, direction);
    updateSource(edit.value);
    editor.view.dispatch(closeHistory(editor.state.tr));
    return;
  }
  const undo = (event.ctrlKey || event.metaKey) && key === 'z';
  const redo = event.ctrlKey && !event.metaKey && key === 'y';
  if (!undo && !redo) return;
  event.preventDefault();
  if (redo || event.shiftKey) editor.commands.redo();
  else editor.commands.undo();
}
