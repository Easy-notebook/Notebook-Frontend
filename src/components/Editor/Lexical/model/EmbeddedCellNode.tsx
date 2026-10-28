import { DecoratorNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { ReactElement } from 'react';
import { EmbeddedCell } from '../components/EmbeddedCell';
import type { Cell } from '@Store/models';

type SerializedEmbeddedCell = Spread<
  {
    cellId: string;
    kind: Cell['type'];
    source: string;
    language?: Cell['language'];
    editorMode?: string;
    sourceCellType?: string;
  },
  SerializedLexicalNode
>;
export class EmbeddedCellNode extends DecoratorNode<ReactElement> {
  __cellId: string;
  __kind: Cell['type'];
  __source: string;
  __language: Cell['language'];
  __editorMode?: string;
  __sourceCellType?: string;
  static getType() {
    return 'embedded-cell';
  }
  static clone(node: EmbeddedCellNode) {
    return new EmbeddedCellNode(node.toCell(), node.__key);
  }
  constructor(cell: Cell = { id: '', type: 'code', content: '', outputs: [] }, key?: NodeKey) {
    super(key);
    this.__cellId = cell.id;
    this.__kind = cell.type;
    this.__source = cell.content;
    this.__language = cell.language;
    this.__editorMode = cell.metadata?.editorMode;
    this.__sourceCellType = cell.metadata?.sourceCellType;
  }
  static importJSON(data: SerializedEmbeddedCell) {
    return new EmbeddedCellNode({
      id: data.cellId,
      type: data.kind,
      content: data.source,
      language: data.language,
      outputs: [],
      metadata: { editorMode: data.editorMode, sourceCellType: data.sourceCellType },
    });
  }
  exportJSON(): SerializedEmbeddedCell {
    return {
      ...super.exportJSON(),
      type: EmbeddedCellNode.getType(),
      version: 1,
      cellId: this.__cellId,
      kind: this.__kind,
      source: this.__source,
      language: this.__language,
      editorMode: this.__editorMode,
      sourceCellType: this.__sourceCellType,
    };
  }
  toCell(latest?: Cell): Cell {
    const node = this.getLatest();
    return {
      ...latest,
      id: node.__cellId,
      type: node.__kind,
      content: node.__source,
      language: node.__language,
      outputs: latest?.outputs ?? [],
      metadata:
        latest?.metadata || node.__editorMode || node.__sourceCellType
          ? {
              ...latest?.metadata,
              editorMode: node.__editorMode,
              sourceCellType: node.__sourceCellType,
            }
          : undefined,
    };
  }
  sync(cell: Cell) {
    const current = this.getLatest();
    // Agent events and code outputs belong to the store subscription, not the document tree.
    if (
      current.__source === cell.content &&
      current.__language === cell.language &&
      current.__editorMode === cell.metadata?.editorMode &&
      current.__sourceCellType === cell.metadata?.sourceCellType
    )
      return;
    const self = this.getWritable();
    self.__source = cell.content;
    self.__language = cell.language;
    self.__editorMode = cell.metadata?.editorMode;
    self.__sourceCellType = cell.metadata?.sourceCellType;
  }
  createDOM() {
    const dom = document.createElement('div');
    dom.id = 'cell-' + this.__cellId;
    dom.dataset.cellId = this.__cellId;
    dom.dataset.type = `${this.__kind}-cell`;
    dom.className = 'notebook-embedded-cell';
    return dom;
  }
  getTextContent() {
    return this.getLatest().__source;
  }
  exportDOM() {
    const node = this.getLatest();
    const element = document.createElement('div');
    element.dataset.type = 'notebook-embedded';
    element.dataset.cellId = node.__cellId;
    element.dataset.cellKind = node.__kind;
    element.dataset.source = encodeURIComponent(node.__source);
    if (node.__language) element.dataset.language = node.__language;
    if (node.__editorMode) element.dataset.editorMode = node.__editorMode;
    if (node.__sourceCellType) element.dataset.sourceCellType = node.__sourceCellType;
    element.textContent = node.__source;
    return { element };
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return false;
  }
  getCellId() {
    return this.getLatest().__cellId;
  }
  decorate() {
    return <EmbeddedCell cellId={this.__cellId} />;
  }
}
