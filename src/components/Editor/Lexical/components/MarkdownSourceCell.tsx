import { useRef, useLayoutEffect } from 'react';
import { handleSourceInputHistory, useSourceNativeHistory } from '../interaction/sourceInput';
import type { Cell } from '@Store/models';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { useCellEditAccess } from '../../EditorAccessContext';
import { previewCellSource } from '../interaction/SourceTransitions';
export function MarkdownSourceCell({ cell }: { cell: Cell }) {
  const session = useNotebookEditorSession();
  const { readOnly, viewReadOnly } = useCellEditAccess(cell.id);
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  useLayoutEffect(() => {
    if (!viewReadOnly && !input.current?.readOnly) input.current?.focus({ preventScroll: true });
  }, [viewReadOnly]);
  const canEdit = () => !readOnly && session.owns();
  useSourceNativeHistory(input, session.editor, canEdit, composing);
  return (
    <div className="notebook-source-cell" data-cell-id={cell.id} contentEditable={false}>
      <div className="notebook-source-toolbar">
        <span>
          {cell.type === 'code' ? `${cell.language || 'Code'} source` : 'Markdown source'}
        </span>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            if (!composing.current) session.replace(previewCellSource(cell), cell);
          }}
        >
          Preview
        </button>
      </div>
      <textarea
        ref={input}
        aria-label="Markdown cell source"
        className="notebook-source-textarea"
        value={cell.content}
        readOnly={readOnly}
        spellCheck={false}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(event) => session.updateSource(cell.id, cell.content, event.target.value)}
        onKeyDown={(event) =>
          handleSourceInputHistory(
            event,
            session.editor,
            (source) => session.updateSource(cell.id, cell.content, source),
            composing.current
          )
        }
      />
    </div>
  );
}
