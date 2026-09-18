import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Editor, EditorEvents } from '@tiptap/react';
import { convertEditorStateToCells } from '@Editor/utils/cellConverters';
import useStore from '@Store/notebookStore';
import { cellsChanged, reconcileCells } from '../model/reconcileCells';
import { EXTERNAL_CELL_SYNC } from '../model/documentSync';
import enLocale from '../../../../i18n/locales/en.json';
import zhLocale from '../../../../i18n/locales/zh.json';

interface UseEditorEventsProps {
  setCurrentEditor: Dispatch<SetStateAction<Editor | null>>;
  editorRef: MutableRefObject<Editor | null>;
  defaultTitle: string;
}

export function useEditorEvents({
  setCurrentEditor,
  editorRef,
  defaultTitle,
}: UseEditorEventsProps) {
  const defaultTitleRef = useRef(defaultTitle);
  const previousTitleRef = useRef('');

  useEffect(() => {
    defaultTitleRef.current = defaultTitle;
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    const first = editor.state.doc.firstChild;
    const knownDefaults = [
      enLocale.common.untitled,
      zhLocale.common.untitled,
      'Untitled',
      '未命名',
    ];
    if (
      first?.type.name === 'title' &&
      knownDefaults.includes(first.textContent) &&
      first.textContent !== defaultTitle
    ) {
      editor.commands.command(({ tr }) => {
        tr.insertText(defaultTitle, 1, first.nodeSize - 1);
        return true;
      });
    }
  }, [defaultTitle, editorRef]);

  const onCreate = ({ editor }: EditorEvents['create']) => {
    editorRef.current = editor;
    setCurrentEditor(editor);
  };

  const onDestroy = () => {
    editorRef.current = null;
    setCurrentEditor(null);
  };

  const onTransaction = ({ editor, transaction }: EditorEvents['transaction']) => {
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

    const first = transaction.doc.firstChild;
    if (first?.type.name === 'title' && first.textContent === defaultTitleRef.current) {
      const { selection } = transaction;
      if (selection.from !== 1 || selection.to !== 1) {
        queueMicrotask(() => {
          if (
            !editor.isDestroyed &&
            editor.state.doc.firstChild?.textContent === defaultTitleRef.current
          ) {
            editor.commands.setTextSelection(1);
          }
        });
      }
    }
  };

  const onUpdate = ({ editor, transaction }: EditorEvents['update']) => {
    if (transaction.getMeta(EXTERNAL_CELL_SYNC)) return;

    const first = editor.state.doc.firstChild;
    const title = first?.type.name === 'title' ? first.textContent : '';
    if (first?.type.name === 'title' && !title) {
      queueMicrotask(() => {
        if (!editor.isDestroyed && !editor.state.doc.firstChild?.textContent) {
          editor.commands.command(({ tr }) => {
            tr.insertText(defaultTitleRef.current, 1);
            return true;
          });
        }
      });
    } else if (
      first?.type.name === 'title' &&
      previousTitleRef.current === defaultTitleRef.current &&
      title !== defaultTitleRef.current &&
      title.includes(defaultTitleRef.current)
    ) {
      const replacement = title.replace(defaultTitleRef.current, '');
      queueMicrotask(() => {
        if (editor.isDestroyed) return;
        const current = editor.state.doc.firstChild;
        if (current?.type.name === 'title' && current.textContent === title) {
          editor.commands.command(({ tr }) => {
            tr.insertText(replacement, 1, current.nodeSize - 1);
            return true;
          });
        }
      });
    }
    previousTitleRef.current = title;

    const store = useStore.getState();
    const next = reconcileCells(convertEditorStateToCells(editor), store.cells);
    if (cellsChanged(next, store.cells)) store.setCells(next);
  };

  return { onCreate, onDestroy, onTransaction, onUpdate };
}
