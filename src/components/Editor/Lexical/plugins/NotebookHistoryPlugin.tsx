import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';

/** External revisions reset the timeline, but the first local action must remain undoable. */
export function registerNotebookHistory(editor: LexicalEditor) {
  const state = createEmptyHistoryState();
  const reset = () => {
    state.current = { editor, editorState: editor.getEditorState() };
    state.undoStack.length = 0;
    state.redoStack.length = 0;
    editor.dispatchCommand(CAN_UNDO_COMMAND, false);
    editor.dispatchCommand(CAN_REDO_COMMAND, false);
  };
  reset();
  return mergeRegister(
    registerHistory(editor, state, 300),
    editor.registerCommand(
      CLEAR_HISTORY_COMMAND,
      () => {
        reset();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    )
  );
}
export function NotebookHistoryPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerNotebookHistory(editor), [editor]);
  return null;
}
