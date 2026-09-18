import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Editor, EditorEvents } from '@tiptap/react';
import { convertEditorStateToCells } from '@Editor/utils/cellConverters';
import useStore from '@Store/notebookStore';
import { cellsChanged, reconcileCells } from '../model/reconcileCells';
import { EXTERNAL_CELL_SYNC } from '../model/documentSync';

interface UseEditorEventsProps {
  setCurrentEditor: Dispatch<SetStateAction<Editor | null>>;
  editorRef: MutableRefObject<Editor | null>;
}

export function useEditorEvents({ setCurrentEditor, editorRef }: UseEditorEventsProps) {
  const onCreate = ({ editor }: EditorEvents['create']) => {
    editorRef.current = editor;
    setCurrentEditor(editor);
  };

  const onDestroy = () => {
    editorRef.current = null;
    setCurrentEditor(null);
  };

  const onTransaction = ({ transaction }: EditorEvents['transaction']) => {
    if (transaction.getMeta('codeBlockInputRule')) {
      const cellId = transaction.getMeta('newCodeCellId') as string | undefined;
      if (cellId) {
        const store = useStore.getState();
        store.setCurrentCell(cellId);
        store.setEditingCellId?.(cellId);
        requestAnimationFrame(() => {
          const code = document.querySelector(`[data-cell-id="${CSS.escape(cellId)}"] .cm-content`);
          (code as HTMLElement | null)?.focus();
        });
      }
    }
  };

  const onUpdate = ({ editor, transaction }: EditorEvents['update']) => {
    if (transaction.getMeta(EXTERNAL_CELL_SYNC)) return;

    const store = useStore.getState();
    const next = reconcileCells(convertEditorStateToCells(editor), store.cells);
    if (cellsChanged(next, store.cells)) store.setCells(next);
  };

  return { onCreate, onDestroy, onTransaction, onUpdate };
}
