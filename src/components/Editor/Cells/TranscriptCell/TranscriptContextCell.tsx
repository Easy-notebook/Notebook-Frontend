import type { Cell } from '@Store/models';
import { TranscriptContextChange } from '@Utils/importFile/TranscriptContextChange';

export function TranscriptContextCell({ cell, onEdit }: { cell: Cell; onEdit?: () => void }) {
  const { label, target } = new TranscriptContextChange(cell).description;
  return (
    <div className="transcript-context-row">
      <span className="transcript-context-operation">{label}</span>
      <span className="transcript-context-target">{target}</span>
      <details className="transcript-context-source">
        <summary>原文</summary>
        <pre>{cell.metadata?.originalSource ?? cell.content}</pre>
      </details>
      {onEdit && (
        <button type="button" onClick={onEdit}>
          编辑
        </button>
      )}
    </div>
  );
}
