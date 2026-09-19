import { useCallback, useMemo } from 'react';
import { BaseNodeView } from '../../core/BaseNodeView';
import { CodeBlockModel, CodeBlockContext } from './CodeBlockModel';
import CodeCell from '../../../Cells/CodeCell';
import HybridCell from '../../../Cells/HybridCell';
import useStore from '@Store/notebookStore';
import { getCellById } from '@Store/models/cellIndex';
import {
  breakCodeBlockFence,
  editCodeBlockSource,
} from '../../../TipTap/model/sourceCellTransitions';
import { codeCellFromAttributes } from '../../../utils/codeCellAttributes';

const CodeBlockViewComponent = (props: any) => {
  const { node, editor, getPos } = props;
  const { cellId } = node.attrs;
  const existingCell = useStore((state) => getCellById(state.cells, cellId));

  // Create virtual cell object (logic ported from original CodeBlockView)
  const virtualCell = useMemo(() => {
    if (existingCell) {
      return existingCell;
    }
    return codeCellFromAttributes(node.attrs, cellId);
  }, [cellId, existingCell, node.attrs]);

  const handleDelete = useCallback(() => {
    const pos = getPos?.();
    if (typeof pos !== 'number') return;
    const latest = getCellById(useStore.getState().cells, cellId) || virtualCell;
    breakCodeBlockFence(editor, pos, latest);
  }, [editor, getPos, cellId, virtualCell]);

  const CellComponent = virtualCell.type === 'hybrid' ? HybridCell : CodeCell;

  return (
    <div className="relative my-4">
      <button
        type="button"
        className="text-xs px-2 py-1 disabled:opacity-40"
        disabled={!editor.isEditable}
        aria-label="Edit code cell source"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const pos = getPos?.();
          if (typeof pos !== 'number') return;
          const latest = getCellById(useStore.getState().cells, cellId) || virtualCell;
          editCodeBlockSource(editor, pos, latest);
        }}
      >
        Source
      </button>
      <CellComponent
        cell={virtualCell}
        onDelete={handleDelete}
        onBreakFence={handleDelete}
        dslcMode={false}
        finished_thinking={false}
        thinkingText="finished thinking"
      />
      {((virtualCell && (virtualCell as any).metadata?.isGenerating) || false) && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-lg z-10">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
            <span>Generating code...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const CodeBlockView = (props: any) => {
  return (
    <BaseNodeView<CodeBlockContext>
      {...props}
      createFSM={CodeBlockModel.createFSM}
      createContext={(p) => ({
        node: p.node,
        updateAttributes: p.updateAttributes,
        deleteNode: p.deleteNode,
        editor: p.editor,
        getPos: p.getPos,
      })}
      renderState={() => <CodeBlockViewComponent {...props} />}
    />
  );
};
