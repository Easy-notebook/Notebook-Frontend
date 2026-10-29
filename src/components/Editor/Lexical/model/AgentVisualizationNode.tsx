import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { AgentVisualization } from '../../../AgentVisuals/AgentVisualization';
import { isAgentVisualKind, type AgentVisualKind } from '../../../AgentVisuals/AgentVisualDocument';
import { useEditorReadOnly } from '../../EditorAccessContext';
type SerializedAgentVisual = Spread<
  { kind: AgentVisualKind; source: string },
  SerializedLexicalNode
>;
function AgentVisualView({
  nodeKey,
  kind,
  source,
}: {
  nodeKey: NodeKey;
  kind: AgentVisualKind;
  source: string;
}) {
  const [editor] = useLexicalComposerContext();
  const readOnly = useEditorReadOnly();
  return (
    <AgentVisualization
      kind={kind}
      source={source}
      onChange={
        readOnly
          ? undefined
          : (next) =>
              editor.update(
                () => {
                  const node = $getNodeByKey(nodeKey);
                  if (
                    editor.isEditable() &&
                    node instanceof AgentVisualizationNode &&
                    node.getSource() === source
                  )
                    node.setSource(next);
                },
                { discrete: true }
              )
      }
    />
  );
}
export class AgentVisualizationNode extends DecoratorNode<React.ReactNode> {
  __kind: AgentVisualKind;
  __source: string;
  static getType() {
    return 'agent-visualization';
  }
  static clone(node: AgentVisualizationNode) {
    return new AgentVisualizationNode(node.__kind, node.__source, node.__key);
  }
  constructor(kind: AgentVisualKind = 'agent-tree', source = '{}', key?: NodeKey) {
    super(key);
    this.__kind = kind;
    this.__source = source;
  }
  static importJSON(data: SerializedAgentVisual) {
    if (!isAgentVisualKind(data.kind)) throw new Error('Unknown agent visualization');
    return new AgentVisualizationNode(data.kind, data.source).updateFromJSON(data);
  }
  exportJSON(): SerializedAgentVisual {
    return {
      ...super.exportJSON(),
      type: AgentVisualizationNode.getType(),
      version: 1,
      kind: this.__kind,
      source: this.__source,
    };
  }
  createDOM() {
    const element = document.createElement('div');
    element.dataset.agentVisualization = this.__kind;
    return element;
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return false;
  }
  getSource() {
    return this.getLatest().__source;
  }
  setSource(source: string) {
    this.getWritable().__source = source;
  }
  getTextContent() {
    const node = this.getLatest();
    const runs = node.__source.match(/`+/g) ?? [];
    const fence = '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
    return `${fence}${node.__kind}\n${node.__source}\n${fence}`;
  }
  exportDOM() {
    const element = document.createElement('pre');
    element.textContent = this.getTextContent();
    return { element };
  }
  decorate() {
    return <AgentVisualView nodeKey={this.__key} kind={this.__kind} source={this.__source} />;
  }
}
export const $createAgentVisualization = (kind: AgentVisualKind, source: string) =>
  $applyNodeReplacement(new AgentVisualizationNode(kind, source));
