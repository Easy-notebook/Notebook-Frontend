import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { canEditSelectedCellSource, editSelectedCellSource } from '../model/sourceCellTransitions';

/** Only this control observes selection changes, not the entire notebook view. */
export function CellSourceButton({ editor }: { editor: Editor }) {
  const [enabled, setEnabled] = useState(() => canEditSelectedCellSource(editor));
  useEffect(() => {
    const update = () => setEnabled(canEditSelectedCellSource(editor));
    update();
    editor.on('transaction', update);
    editor.on('update', update);
    return () => {
      editor.off('transaction', update);
      editor.off('update', update);
    };
  }, [editor]);
  return (
    <button
      type="button"
      className="text-sm px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
      disabled={!enabled}
      title={
        enabled ? 'Edit selected Markdown cell source' : 'Select a Markdown cell to edit its source'
      }
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editSelectedCellSource(editor)}
    >
      Cell source
    </button>
  );
}
