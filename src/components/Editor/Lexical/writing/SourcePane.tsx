import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Cell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { handleSourceInputHistory, useSourceNativeHistory } from '../interaction/sourceInput';
function SourceField({ cell }: { cell: Cell }) {
  const session = useNotebookEditorSession(),
    readOnly = useEditorReadOnly();
  const input = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false);
  const [error, setError] = useState('');
  useSourceNativeHistory(input, session.editor, () => !readOnly && session.owns(), composing);
  return (
    <div className="notebook-source-field">
      <textarea
        ref={input}
        aria-label={`Markdown 源码 ${cell.id}`}
        value={cell.content}
        readOnly={readOnly}
        spellCheck={false}
        rows={Math.min(24, Math.max(3, cell.content.split('\n').length + 1))}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(e) => {
          if (!session.updateSource(cell.id, cell.content, e.target.value))
            setError('内容已更新，请重新核对后编辑。');
          else setError('');
        }}
        onKeyDown={(e) =>
          handleSourceInputHistory(
            e,
            session.editor,
            (source) => session.updateSource(cell.id, cell.content, source),
            composing.current
          )
        }
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function SourcePane({ mode }: { mode: 'rich' | 'source' | 'split' }) {
  const session = useNotebookEditorSession(),
    cells = useStore((s) => s.cells);
  const frame = session.editor.getRootElement()?.parentElement;
  if (mode === 'rich' || !frame) return null;
  return createPortal(
    <section className="notebook-source-pane" aria-label="文档 Markdown 源码">
      {cells.map((cell) =>
        cell.type === 'markdown' ? (
          <SourceField key={cell.id} cell={cell} />
        ) : (
          <div key={cell.id} className="notebook-source-embedded">
            <span>{cell.type} cell</span>
            <pre>{cell.content}</pre>
          </div>
        )
      )}
    </section>,
    frame
  );
}
