import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { Cell } from '@Store/models';
import { convertEditorStateToCells } from '@Editor/utils/cellConverters';
import { synchronizeDocument } from '../model/documentSync';

function documentMatchesCells(editor: Editor, cells: Cell[]): boolean {
  const projected = convertEditorStateToCells(editor);
  return (
    projected.length === cells.length &&
    projected.every((cell, index) => {
      const stored = cells[index];
      if (cell.id !== stored.id || cell.type !== stored.type) return false;
      // Executable cells are updated through their store-backed NodeView.
      if (cell.type === 'code' || cell.type === 'hybrid' || cell.type === 'thinking') return true;
      return cell.content === stored.content;
    })
  );
}

export function useEditorSync({ editor, cells }: { editor: Editor | null; cells: Cell[] }) {
  useEffect(() => {
    if (!editor || documentMatchesCells(editor, cells)) return;
    synchronizeDocument(editor, cells);
  }, [editor, cells]);
}
