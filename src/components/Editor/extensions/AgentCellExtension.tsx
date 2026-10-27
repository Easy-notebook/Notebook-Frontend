import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { AgentCell } from '../Cells/AgentCell/AgentCell';
import { useEditorReadOnly } from '../EditorAccessContext';
function AgentCellView({ node }: NodeViewProps) {
  const readOnly = useEditorReadOnly();
  return (
    <NodeViewWrapper data-cell-id={node.attrs.cellId}>
      <AgentCell cellId={node.attrs.cellId} readOnly={readOnly} />
    </NodeViewWrapper>
  );
}
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    agentCell: { insertAgentCell: (cellId: string) => ReturnType };
  }
}
export const AgentCellExtension = Node.create({
  name: 'agentCell',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-id'),
        renderHTML: (attributes) => ({ 'data-cell-id': attributes.cellId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="agent-cell"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'agent-cell' })];
  },
  addCommands() {
    return {
      insertAgentCell:
        (cellId: string) =>
        ({ state, commands }) => {
          // A notebook cell must be a document child, never nested inside a Markdown cell.
          const { $from } = state.selection;
          const position = $from.depth > 0 ? $from.after(1) : $from.pos;
          return commands.insertContentAt(
            position,
            { type: this.name, attrs: { cellId } },
            { updateSelection: false }
          );
        },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AgentCellView);
  },
});
