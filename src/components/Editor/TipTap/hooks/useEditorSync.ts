import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { Cell } from '@Store/models';
import { synchronizeDocument } from '../model/documentSync';

export function useEditorSync({ editor, cells }: { editor: Editor | null; cells: Cell[] }) {
  useEffect(() => {
    if (!editor) return;
    synchronizeDocument(editor, cells);
  }, [editor, cells]);
}
