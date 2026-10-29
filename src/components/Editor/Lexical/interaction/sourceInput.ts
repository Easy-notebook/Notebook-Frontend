import type { KeyboardEvent } from 'react';
import { useEffect, type RefObject } from 'react';
import { UNDO_COMMAND, REDO_COMMAND, HISTORY_PUSH_TAG, type LexicalEditor } from 'lexical';
import { isCompositionInput } from '../../utils/compositionInput';
import { indentSourceChange } from '../../utils/sourceIndentation';

/** Native edit-menu history must share the transaction owner used by shortcuts. */
export function useSourceNativeHistory(
  input: RefObject<HTMLTextAreaElement | null>,
  editor: LexicalEditor,
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
        !editor.isEditable() ||
        (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.inputType === 'historyUndo') editor.dispatchCommand(UNDO_COMMAND, undefined);
      else editor.dispatchCommand(REDO_COMMAND, undefined);
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, [input, editor, canEdit, composing, active]);
}

/** Source text is stored in document transactions; use that same undo history. */
export function handleSourceInputHistory(
  event: KeyboardEvent<HTMLTextAreaElement>,
  editor: LexicalEditor,
  updateSource?: (source: string) => void,
  composing = false
) {
  event.stopPropagation();
  if (!editor.isEditable() || composing || isCompositionInput(event.nativeEvent) || event.altKey)
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
    // Update the native input before publishing its controlled value. React then
    // sees matching text and retains this selection; no deferred caret write can
    // overwrite a later keypress, click, or undo.
    input.setRangeText(edit.insert, edit.from, edit.to, 'preserve');
    input.setSelectionRange(edit.start, edit.end, direction);
    editor.update(() => updateSource(input.value), { tag: HISTORY_PUSH_TAG, discrete: true });
    return;
  }
  const undo = (event.ctrlKey || event.metaKey) && key === 'z';
  const redo = event.ctrlKey && !event.metaKey && key === 'y';
  if (!undo && !redo) return;
  event.preventDefault();
  if (redo || event.shiftKey) editor.dispatchCommand(REDO_COMMAND, undefined);
  else editor.dispatchCommand(UNDO_COMMAND, undefined);
}
