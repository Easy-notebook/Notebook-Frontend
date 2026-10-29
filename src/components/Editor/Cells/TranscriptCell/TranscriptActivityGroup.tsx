import type { ReactNode } from 'react';
import type { Cell } from '@Store/models';
import type { TranscriptActivitySequence } from '@Utils/importFile/TranscriptActivitySequence';
import './transcript-cell.css';

export function TranscriptActivityGroup({
  sequence,
  renderCell,
  expanded,
  onExpandedChange,
}: {
  sequence: TranscriptActivitySequence;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  renderCell: (cell: Cell) => ReactNode;
}) {
  return (
    <details
      className="transcript-activity-group"
      open={expanded}
      onToggle={(event) => onExpandedChange(event.currentTarget.open)}
    >
      <summary>
        工具记录
        <span>
          {sequence.calls ? `${sequence.calls} 次调用` : `${sequence.cells.length} 条状态`}
          {sequence.outputs ? ` · ${sequence.outputs} 份输出` : ''}
        </span>
      </summary>
      <ol className="transcript-activity-steps">
        {sequence.entries.map(({ call, context, ordinal }) =>
          call ? (
            <li key={call.id} data-transcript-step-id={call.id}>
              <div className="transcript-step-label">
                <span>{String(ordinal).padStart(2, '0')}</span>
                {call.metadata?.toolName}
              </div>
              {renderCell(call)}
              {context.length > 0 && (
                <div className="transcript-context" aria-label="局部上下文">
                  <div className="transcript-context-label">局部上下文</div>
                  {context.map((cell) => (
                    <div key={cell.id} data-transcript-context-id={cell.id}>
                      {renderCell(cell)}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ) : (
            <li key={context[0].id} className="transcript-context" aria-label="会话上下文">
              {context.map((cell) => (
                <div key={cell.id} data-transcript-context-id={cell.id}>
                  {renderCell(cell)}
                </div>
              ))}
            </li>
          )
        )}
      </ol>
    </details>
  );
}
