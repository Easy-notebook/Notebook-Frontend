import { MarkdownSourceBlockNode } from './MarkdownSourceBlockNode';
import {
  ElementNode,
  configExtension,
  defineExtension,
  type EditorConfig,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';
import { MdastImportExtension } from '@lexical/mdast';
import type { Literal as MdastLiteral } from 'mdast';

// A raw Markdown segment is an explicit codec value, not an HTML fragment.
declare module 'mdast' {
  interface NotebookSource extends MdastLiteral {
    type: 'notebookSource';
    value: string;
  }
  interface PhrasingContentMap {
    notebookSource: NotebookSource;
  }
  interface RootContentMap {
    notebookSource: NotebookSource;
  }
}
type SerializedSource = Spread<{ blockSource: boolean }, SerializedElementNode>;
/** Real contenteditable text: normal browser selection, wrapping, IME and clipboard. */
export class MarkdownSourceNode extends ElementNode {
  __blockSource: boolean;
  static getType() {
    return 'notebook-markdown-source';
  }
  static clone(node: MarkdownSourceNode) {
    return new MarkdownSourceNode(node.__blockSource, node.__key);
  }
  constructor(blockSource = false, key?: NodeKey) {
    super(key);
    this.__blockSource = blockSource;
  }
  static importJSON(data: SerializedSource) {
    return new MarkdownSourceNode(data.blockSource).updateFromJSON(data);
  }
  exportJSON(): SerializedSource {
    return {
      ...super.exportJSON(),
      type: MarkdownSourceNode.getType(),
      blockSource: this.isBlockSource(),
    };
  }
  isBlockSource() {
    return this.getLatest().__blockSource;
  }
  canBeEmpty() {
    return false;
  }
  isInline() {
    return true;
  }
  createDOM(_config: EditorConfig) {
    const dom = document.createElement('span');
    dom.className = 'notebook-markdown-source';
    return dom;
  }
  updateDOM() {
    return false;
  }
}
export const MarkdownSourceExtension = defineExtension({
  name: 'notebook/markdown-source',
  nodes: [MarkdownSourceNode, MarkdownSourceBlockNode],
  dependencies: [
    configExtension(MdastImportExtension, {
      exportRules: [
        {
          type: MarkdownSourceBlockNode.getType(),
          $export: (node) => ({ type: 'notebookSource', value: node.getTextContent() }),
        },
        {
          type: MarkdownSourceNode.getType(),
          $export: (node) => ({ type: 'notebookSource', value: node.getTextContent() }),
        },
      ],
      toMarkdownExtensions: [{ handlers: { notebookSource: (node) => node.value } }],
    }),
  ],
});
