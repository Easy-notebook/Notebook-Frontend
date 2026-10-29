import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  configExtension,
  defineExtension,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { MdastImportExtension, type MdastNode } from '@lexical/mdast';
import { scientificMarkdownGrammar } from './ScientificMarkdownSyntax';
import { scientificSource, scientificDataFromAst, type ScientificData } from './ScientificSource';
import { FormulaView } from '../components/FormulaView';
import { useEditorReadOnly } from '../../EditorAccessContext';

type SerializedScientificNode = Spread<ScientificData, SerializedLexicalNode>;
function ScientificView({ data, nodeKey }: { data: ScientificData; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const readOnly = useEditorReadOnly();
  const change = (patch: Partial<ScientificData>) => {
    if (readOnly || !editor.isEditable()) return;
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof ScientificNode && node.getData() === data)
          node.setData({ ...data, ...patch, source: undefined });
      },
      { discrete: true }
    );
  };
  const remove = () => {
    if (!readOnly)
      editor.update(() => {
        $getNodeByKey(nodeKey)?.remove();
      });
  };
  return (
    <FormulaView
      latex={data.value}
      displayMode={data.display}
      readOnly={readOnly}
      onChange={({ latex, displayMode }) =>
        change({ value: latex ?? data.value, display: displayMode ?? data.display })
      }
      onDelete={remove}
    />
  );
}

export class ScientificNode extends DecoratorNode<React.ReactNode> {
  __data: ScientificData;
  static getType() {
    return 'scientific-markdown';
  }
  static clone(node: ScientificNode) {
    return new ScientificNode(node.__data, node.__key);
  }
  constructor(data: ScientificData = { syntax: 'math', value: '', display: true }, key?: NodeKey) {
    super(key);
    this.__data = data;
  }
  static importJSON(data: SerializedScientificNode) {
    return new ScientificNode(data);
  }
  exportJSON(): SerializedScientificNode {
    return { ...super.exportJSON(), ...this.__data, type: ScientificNode.getType(), version: 1 };
  }
  createDOM() {
    return document.createElement(this.isInline() ? 'span' : 'div');
  }
  updateDOM(previous: ScientificNode) {
    return previous.isInline() !== this.isInline();
  }
  isInline() {
    return !this.__data.display;
  }
  exportDOM() {
    const data = this.getData();
    const element = document.createElement(data.display ? 'div' : 'span');
    element.dataset.type = 'latex-block';
    element.dataset.latex = data.value;
    element.dataset.displayMode = String(data.display);
    return { element };
  }
  getTextContent() {
    return scientificSource(this.getData());
  }
  getData() {
    return this.getLatest().__data;
  }
  setData(data: ScientificData) {
    this.getWritable().__data = data;
  }
  decorate() {
    return <ScientificView data={this.__data} nodeKey={this.__key} />;
  }
}
export const ScientificExtension = defineExtension({
  name: 'notebook/scientific',
  nodes: [ScientificNode],
  dependencies: [
    configExtension(MdastImportExtension, {
      ...scientificMarkdownGrammar,
      inlineShortcutTypes: ['inlineMath', 'notebookLatex'],
      inlineShortcutTriggers: ['$', ')', ']'],
      importRules: ['math', 'inlineMath', 'notebookLatex', 'notebookLatexDraft'].map((type) => ({
        type,
        $import: (node: MdastNode, context) =>
          $applyNodeReplacement(new ScientificNode(scientificDataFromAst(node, context.source))),
      })),
      exportRules: [
        {
          type: ScientificNode.getType(),
          $export: (node) =>
            node instanceof ScientificNode
              ? ({
                  type: 'notebookScientificSource',
                  value: scientificSource(node.getData()),
                } as MdastNode)
              : null,
        },
      ],
    }),
  ],
});
