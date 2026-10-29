import { useMemo, useState } from 'react';
import { AgentLanes } from './AgentLanes';
import { AgentTree } from './AgentTree';
import { parseAgentVisual, type AgentVisualKind } from './AgentVisualDocument';
export function AgentVisualization({
  kind,
  source,
  onChange,
}: {
  kind: AgentVisualKind;
  source: string;
  onChange?(source: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const [base, setBase] = useState(source);
  const [error, setError] = useState('');
  const parsed = useMemo(() => {
    try {
      return { document: parseAgentVisual(kind, source) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [kind, source]);
  return (
    <div
      className="av-theme av-markdown"
      contentEditable={false}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {onChange && (
        <div className="av-source-toolbar">
          <button
            onClick={() => {
              setEditing(!editing);
              setDraft(source);
              setBase(source);
              setError('');
            }}
          >
            {editing ? 'Cancel' : 'Edit source'}
          </button>
          {editing && (
            <button
              onClick={() => {
                try {
                  if (source !== base)
                    throw new Error(
                      'This block changed while you were editing. Copy your draft, then cancel and reopen the latest source.'
                    );
                  parseAgentVisual(kind, draft);
                  onChange(draft);
                  setEditing(false);
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : String(failure));
                }
              }}
            >
              Apply
            </button>
          )}
        </div>
      )}
      {editing ? (
        <>
          <textarea
            aria-label={`${kind} JSON source`}
            className="av-source-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {error && (
            <p role="alert" className="av-error">
              {error}
            </p>
          )}
        </>
      ) : parsed.document ? (
        parsed.document.kind === 'agent-tree' ? (
          <AgentTree {...parsed.document.data} />
        ) : (
          <AgentLanes {...parsed.document.data} />
        )
      ) : (
        <div className="av-error" role="alert">
          {parsed.error}
          <details>
            <summary>Source</summary>
            <pre>{source}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
