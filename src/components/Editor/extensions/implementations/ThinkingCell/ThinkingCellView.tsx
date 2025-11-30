import { BaseNodeView } from '../../core/BaseNodeView';
import { ThinkingCellModel, ThinkingCellContext } from './ThinkingCellModel';
import AIThinkingCell from '../../../Cells/AIThinkingCell/AIThinkingCell';
import { NodeViewWrapper } from '@tiptap/react';

const ThinkingCellViewComponent = (props: any) => {
  const { node, deleteNode, fsm } = props;
  const { cellId, agentName, customText, textArray, useWorkflowThinking } = node.attrs;

  // Construct the cell object expected by AIThinkingCell
  const cell = {
    id: cellId!,
    content: '', // Thinking cell content is usually in textArray
    agentName,
    customText,
    textArray,
    useWorkflowThinking,
  };

  return (
    <NodeViewWrapper>
      <AIThinkingCell
        cell={cell as any}
        onDelete={() => deleteNode()}
        isInDetachedView={false}
        // We could pass fsm state here if AIThinkingCell needs it,
        // but AIThinkingCell mostly relies on props/store.
        // We can use fsm to control visibility or other wrapper logic if needed.
      />
    </NodeViewWrapper>
  );
};

export const ThinkingCellView = (props: any) => {
  return (
    <BaseNodeView<ThinkingCellContext>
      {...props}
      createFSM={ThinkingCellModel.createFSM}
      createContext={(p) => ({
        node: p.node,
        updateAttributes: p.updateAttributes,
        deleteNode: p.deleteNode,
      })}
      renderState={(state, context, fsm) => <ThinkingCellViewComponent {...props} fsm={fsm} />}
    />
  );
};
