import { $getExtensionOutput } from '@lexical/extension';
import { useImperativeHandle, type ForwardedRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, type LexicalEditor } from 'lexical';
import { $generateHtmlFromNodes, DOMImportExtension } from '@lexical/html';
import type { Cell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
export interface NotebookEditorRef {
  editor: LexicalEditor;
  focus: () => void;
  getHTML: () => string;
  setContent: (content: string) => void;
  clearContent: () => void;
  isEmpty: () => boolean;
  getCells: () => Cell[];
  setCells: (cells: Cell[]) => void;
  addCodeCell: () => string;
  addMarkdownCell: () => string;
  addHybridCell: () => string;
  addRawCell: () => string;
  addAIThinkingCell: (
    props?: Partial<{
      agentName: string;
      customText: string | null;
      textArray: string[];
      useWorkflowThinking: boolean;
    }>
  ) => string;
}
export function EditorHandlePlugin({ editorRef }: { editorRef: ForwardedRef<NotebookEditorRef> }) {
  const [editor] = useLexicalComposerContext();
  const session = useNotebookEditorSession();
  useImperativeHandle(editorRef, () => {
    const setCells = (cells: Cell[]) => {
      if (session.owns() && editor.isEditable()) useStore.getState().setCells(cells);
    };
    const add = (type: Cell['type']) => {
      const id = crypto.randomUUID();
      setCells([
        ...useStore.getState().cells,
        {
          id,
          type,
          content: '',
          outputs: [],
          enableEdit: type !== 'thinking',
          ...(type === 'code' || type === 'hybrid' ? { language: 'python' } : {}),
        },
      ]);
      return id;
    };
    return {
      editor,
      focus: () => editor.focus(undefined, { defaultSelection: 'rootEnd' }),
      getHTML: () => editor.getEditorState().read(() => $generateHtmlFromNodes(editor), { editor }),
      setContent: (content) => {
        if (!session.owns() || !editor.isEditable()) return;
        editor.update(() => {
          const nodes = $getExtensionOutput(DOMImportExtension).$generateNodesFromDOM(
            new DOMParser().parseFromString(content, 'text/html')
          );
          $getRoot()
            .clear()
            .append(...nodes);
        });
      },
      clearContent: () => setCells([]),
      isEmpty: () =>
        editor.getEditorState().read(() => $getRoot().getTextContent().trim().length === 0),
      getCells: () => useStore.getState().cells,
      setCells,
      addCodeCell: () => add('code'),
      addMarkdownCell: () => add('markdown'),
      addHybridCell: () => add('hybrid'),
      addRawCell: () => add('raw'),
      addAIThinkingCell: () => add('thinking'),
    };
  }, [editor, session]);
  return null;
}
