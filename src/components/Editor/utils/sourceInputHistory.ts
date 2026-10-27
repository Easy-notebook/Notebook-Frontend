import type { KeyboardEvent } from 'react';
import { useEffect, type RefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { isCompositionInput } from './compositionInput';
import { indentSourceChange } from './sourceIndentation';
import { closeHistory } from '@tiptap/pm/history';

/** Native edit-menu history must share the transaction owner used by shortcuts. */
export function useSourceNativeHistory(
  input: RefObject<HTMLTextAreaElement | null>,
  editor: Editor,
  canEdit: () => boolean,
  composing: RefObject<boolean>,
  active = true
) {
  useEffect(() => {
    const element = input.current;
    if (!active || !element) return;
    const beforeInput = (event: InputEvent) => {
      if (
        !event.cancelable ||
        composing.current ||
        event.isComposing ||
        !canEdit() ||
        !editor.isEditable ||
        editor.isDestroyed ||
        (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.inputType === 'historyUndo') editor.commands.undo();
      else editor.commands.redo();
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, [input, editor, canEdit, composing, active]);
}

/** Source text is stored in document transactions; use that same undo history. */
export function handleSourceInputHistory(
  event: KeyboardEvent<HTMLTextAreaElement>,
  editor: Editor,
  updateSource?: (source: string) => void,
  composing = false
) {
  event.stopPropagation();
  if (!editor.isEditable || composing || isCompositionInput(event.nativeEvent) || event.altKey)
    return;
  const key = event.key.toLowerCase();
  if (updateSource && (event.ctrlKey || event.metaKey) && (key === '[' || key === ']')) {
    event.preventDefault();
    const input = event.currentTarget;
    const value = input.value;
    const edit = indentSourceChange(value, input.selectionStart, input.selectionEnd, key === '[');
    if (
      edit.insert.length === edit.to - edit.from &&
      edit.insert === value.slice(edit.from, edit.to)
    )
      return;
    const direction = input.selectionDirection;
    editor.view.dispatch(closeHistory(editor.state.tr));
    // Update the native input before publishing its controlled value. React then
    // sees matching text and retains this selection; no deferred caret write can
    // overwrite a later keypress, click, or undo.
    input.setRangeText(edit.insert, edit.from, edit.to, 'preserve');
    input.setSelectionRange(edit.start, edit.end, direction);
    updateSource(input.value);
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
