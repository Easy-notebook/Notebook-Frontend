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

export function EmbeddedCell({ cellId }: { cellId: string }) {
  const session = useNotebookEditorSession();
  const cell =
    useStore((state) => state.cells.find((cell) => cell.id === cellId)) ?? session.cell(cellId);
  const readOnly = useEditorReadOnly();
  if (!cell) return null;
  const remove = readOnly ? undefined : () => session.remove(cellId);
  const breakFence = () => session.replace(breakCellFence(cell), cell);
  return (
    <div contentEditable={false} onKeyDown={(event) => event.stopPropagation()}>
      {cell.type === 'agent' ? (
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
