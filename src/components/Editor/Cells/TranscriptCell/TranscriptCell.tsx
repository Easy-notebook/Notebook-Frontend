import { useMemo, useState } from 'react';
import hljs from 'highlight.js';
import { TranscriptCellDocument } from '@Utils/importFile/TranscriptCellDocument';
import './transcript-cell.css';

/** Historical code and activity; authored Markdown lives in the native document editor. */
export function TranscriptCell({
  document,
  onEdit,
  grouped = false,
}: {
  document: TranscriptCellDocument;
  onEdit?: () => void;
  grouped?: boolean;
}) {
  const [copyState, setCopyState] = useState('复制');
  const [sourceVisible, setSourceVisible] = useState(false);
  const { cell } = document;
  const activity = document.activity;
  const highlighted = useMemo(
    () =>
      cell.language && hljs.getLanguage(cell.language)
        ? hljs.highlight(document.text, { language: cell.language, ignoreIllegals: true }).value
        : null,
    [cell.language, document.text]
  );
  const body = (
    <>
      <div className="transcript-actions">
        <span>{cell.language}</span>
        {onEdit && (
          <button type="button" onClick={onEdit}>
            编辑
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(document.text);
              setCopyState('已复制');
            } catch {
              setCopyState('复制失败');
            }
          }}
        >
          {copyState}
        </button>
        <button
          type="button"
          aria-expanded={sourceVisible}
          onClick={() => setSourceVisible(!sourceVisible)}
        >
          原文
        </button>
      </div>
      {cell.metadata?.filePath && <div className="transcript-file">{cell.metadata.filePath}</div>}
      <pre className="transcript-source">
        {highlighted ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code>{document.text}</code>
        )}
      </pre>
      {cell.outputs?.map((output, index) => (
        <details
          open={grouped || undefined}
          className="transcript-output"
          key={String(output.key ?? index)}
        >
          <summary>工具输出 · {String(output.content).split('\n').length} 行</summary>
          <pre>{String(output.content)}</pre>
        </details>
      ))}
      {sourceVisible && (
        <aside className="transcript-original">
          <div>
            原始记录 · L{cell.metadata?.sourceLine}–{cell.metadata?.sourceEndLine}
            {document.issues.length ? ` · ${document.issues.join(' · ')}` : ''}
          </div>
          <pre>{cell.metadata?.originalSource}</pre>
        </aside>
      )}
    </>
  );
  return (
    <section
      className={`claude-transcript${activity ? ' claude-transcript--activity' : ''}`}
      data-transcript-kind={document.kind}
      data-transcript-cell-type={cell.type}
      aria-label={`${document.role} transcript`}
    >
      {activity && !grouped ? (
        <details className="transcript-activity">
          <summary>
            <span className="transcript-tool-name">{cell.metadata?.toolName || '会话记录'}</span>
            <span className="transcript-activity-title">
              {document.text.split('\n')[0].slice(0, 140)}
            </span>
          </summary>
          {body}
        </details>
      ) : (
        body
      )}
    </section>
  );
}
