import { breakCellFence } from '../interaction/SourceTransitions';
import useStore from '@Store/notebookStore';
import CodeCell from '../../Cells/CodeCell';
import HybridCell from '../../Cells/HybridCell';
import { ImageCell } from './ImageCell';
import LinkCell from '../../Cells/LinkCell';
import AIThinkingCell from '../../Cells/AIThinkingCell/AIThinkingCell';
import { AgentCell } from '../../Cells/AgentCell/AgentCell';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { MarkdownSourceCell } from './MarkdownSourceCell';
import { SourceCell } from './SourceCell';
import { TranscriptCellDocument } from '@Utils/importFile/TranscriptCellDocument';
import { TranscriptContextCell } from '../../Cells/TranscriptCell/TranscriptContextCell';
import { TranscriptCell } from '../../Cells/TranscriptCell/TranscriptCell';

import type { Cell } from '@Store/models';
import { TranscriptActivitySequence } from '@Utils/importFile/TranscriptActivitySequence';
import { TranscriptActivityGroup } from '../../Cells/TranscriptCell/TranscriptActivityGroup';

export function EmbeddedCell({ cellId }: { cellId: string }) {
  const session = useNotebookEditorSession();
  const cell =
    useStore((state) => state.cells.find((cell) => cell.id === cellId)) ?? session.cell(cellId);
  const sequence = useStore((state) => TranscriptActivitySequence.project(state.cells).get(cellId));
  if (!cell) return null;
  if (sequence) {
    if (sequence.id !== cellId) return <span data-transcript-group-member hidden />;
    return (
      <div contentEditable={false} onKeyDown={(event) => event.stopPropagation()}>
        <TranscriptActivityGroup
          sequence={sequence}
          expanded={session.isSectionExpanded(sequence.id)}
          onExpandedChange={(expanded) => session.setSectionExpanded(sequence.id, expanded)}
          renderCell={(item) => <EmbeddedCellContent cell={item} grouped />}
        />
      </div>
    );
  }
  return <EmbeddedCellContent cell={cell} />;
}

function EmbeddedCellContent({ cell, grouped = false }: { cell: Cell; grouped?: boolean }) {
  const session = useNotebookEditorSession();
  const readOnly = useEditorReadOnly();
  const cellId = cell.id;
  const remove = readOnly ? undefined : () => session.remove(cellId);
  const breakFence = () => session.replace(breakCellFence(cell), cell);
  const editTranscript = readOnly
    ? undefined
    : () =>
        session.replace({ ...cell, metadata: { ...cell.metadata, editorMode: 'source' } }, cell);
  const transcript =
    cell.metadata?.editorMode !== 'source' ? TranscriptCellDocument.read(cell) : null;
  return (
    <div contentEditable={false} onKeyDown={(event) => event.stopPropagation()}>
      {cell.metadata?.transcriptFormat === 2 && cell.metadata?.editorMode === 'source' ? (
        <MarkdownSourceCell cell={cell} />
      ) : transcript?.role === 'system' && grouped ? (
        <TranscriptContextCell cell={cell} onEdit={editTranscript} />
      ) : transcript ? (
        <TranscriptCell grouped={grouped} document={transcript} onEdit={editTranscript} />
      ) : cell.type === 'agent' ? (
        <AgentCell cellId={cellId} readOnly={readOnly} />
      ) : cell.type === 'code' ? (
        <CodeCell
          cell={cell}
          onDelete={readOnly ? undefined : breakFence}
          onBreakFence={readOnly ? undefined : breakFence}
        />
      ) : cell.type === 'hybrid' ? (
        <HybridCell cell={cell} onDelete={readOnly ? undefined : breakFence} />
      ) : cell.type === 'thinking' ? (
        <AIThinkingCell cell={cell} onDelete={remove} isInDetachedView={false} />
      ) : cell.type === 'image' ? (
        <ImageCell cell={cell} />
      ) : cell.type === 'link' ? (
        <LinkCell cell={cell} readOnly={readOnly} onDelete={remove} />
      ) : cell.type === 'markdown' ? (
        <MarkdownSourceCell cell={cell} />
      ) : (
        <SourceCell cell={cell} onDelete={remove} />
      )}
    </div>
  );
}
