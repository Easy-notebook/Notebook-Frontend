import React, { useCallback, useMemo } from 'react';
import { BaseNodeView, BaseNodeViewProps } from '../../core/BaseNodeView';
import { CodeBlockModel, CodeBlockContext } from './CodeBlockModel';
import CodeCell from '../../../Cells/CodeCell';
import HybridCell from '../../../Cells/HybridCell';
import useStore from '@Store/notebookStore';
import { TextSelection } from 'prosemirror-state';

const CodeBlockViewComponent = (props: any) => {
  const { node, editor, getPos, deleteNode } = props;
  const { cellId, code, outputs, enableEdit } = node.attrs;
  const { cells } = useStore();

  // Create virtual cell object (logic ported from original CodeBlockView)
  const virtualCell = useMemo(() => {
    const existingCell = cells.find((cell) => cell.id === cellId);
    if (existingCell) {
      return existingCell;
    }
    return {
      id: cellId,
      type: 'code' as const,
      content: code || '',
      outputs: outputs || [],
      enableEdit: enableEdit !== false,
    };
  }, [cellId, cells, code, enableEdit, outputs]);

  const handleDelete = useCallback(() => {
    // Ported deletion logic
    if (editor && getPos) {
      const pos = getPos();
      const { tr } = editor.state;
      const nodeStart = pos;
      const nodeEnd = pos + node.nodeSize;

      const placeholder = '```python\n';
      const textNode = editor.state.schema.text(placeholder);
      tr.replaceWith(nodeStart, nodeEnd, textNode);

      let targetPos = nodeStart + placeholder.length;
      if (targetPos >= 0 && targetPos <= tr.doc.content.size) {
        try {
          const $pos = tr.doc.resolve(targetPos);
          const selection = TextSelection.near($pos);
          tr.setSelection(selection);
        } catch (e) {
          console.warn('Set cursor failed', e);
        }
      }
      editor.view.dispatch(tr);

      // Focus handling
      setTimeout(() => {
        const { state: newState, view: newView } = editor;
        const safePos = Math.min(targetPos, newState.doc.content.size);
        try {
          const $pos = newState.doc.resolve(safePos);
          const sel = TextSelection.near($pos);
          newView.dispatch(newState.tr.setSelection(sel).scrollIntoView());
          newView.focus();
        } catch (err) {
          console.warn('Post-delete focus reset failed', err);
        }
      }, 20);
    } else {
      deleteNode();
    }
  }, [deleteNode, editor, getPos, node]);

  const CellComponent = virtualCell.type === 'hybrid' ? HybridCell : CodeCell;

  return (
    <div className="relative my-4">
      <CellComponent
        cell={virtualCell}
        onDelete={handleDelete}
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
      renderState={(state, context, fsm) => <CodeBlockViewComponent {...props} />}
    />
  );
};
