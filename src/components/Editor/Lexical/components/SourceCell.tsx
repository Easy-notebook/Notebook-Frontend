import { useEffect, useRef, useState } from 'react';
import type { Cell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { isCompositionInput } from '../../utils/compositionInput';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';

/** Source edits use compare-and-set: concurrent agent changes never overwrite a local draft. */
export function SourceCell({ cell, onDelete }: { cell: Cell; onDelete?: () => void }) {
  const readOnly = useEditorReadOnly();
  const session = useNotebookEditorSession();
  const [draft, setDraft] = useState<{ base: string; value: string; error?: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const save = () => {
    if (!draft || readOnly || !session.owns()) return;
    const latest = useStore.getState().cells.find((item) => item.id === cell.id);
    if (
      !latest ||
      latest.type !== cell.type ||
      (latest.content !== draft.base && latest.content !== draft.value)
    ) {
      setDraft({
        ...draft,
        error: 'Content changed while editing. Your draft is retained for copying.',
      });
      return;
    }
    if (!session.updateSource(cell.id, latest.content, draft.value)) return;
    setDraft(null);
  };
  return (
    <div className="raw-cell-wrapper my-3" data-type="raw-block">
      {draft ? (
        <>
          <textarea
            ref={input}
            aria-label="Raw cell source"
            className="notebook-source-surface notebook-source-input"
            value={draft.value}
            readOnly={readOnly}
            onChange={(event) => {
              if (!readOnly) setDraft({ ...draft, value: event.target.value });
            }}
            onBlur={save}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (isCompositionInput(event.nativeEvent)) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(null);
              }
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                save();
              }
            }}
          />
          {draft.error && (
            <p role="alert" className="text-sm text-red-600">
              {draft.error}
            </p>
          )}
        </>
      ) : (
        <div className="raw-cell-display group relative">
          <pre
            className="notebook-source-surface"
            onDoubleClick={() => {
              if (!readOnly) setDraft({ base: cell.content, value: cell.content });
            }}
            title="Double-click to edit raw content"
          >
            {cell.content}
          </pre>
          {!readOnly && (
            <>
              <button
                className="notebook-source-action absolute -top-2 right-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => setDraft({ base: cell.content, value: cell.content })}
              >
                Edit
              </button>
              <button
                className="notebook-source-action absolute -top-2 right-14 opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={onDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
