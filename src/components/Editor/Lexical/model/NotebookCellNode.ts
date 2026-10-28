import {
  ElementNode,
  type EditorConfig,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';
import type { Cell } from '@Store/models';

type SerializedNotebookCell = Spread<
  {
    cellId: string;
    kind: Cell['type'];
    source: string | null;
    baseline: string | null;
    title: boolean;
  },
  SerializedElementNode
>;

/** Persistent cell identity owns the rich subtree; outputs and runtime state remain store-owned. */
export class NotebookCellNode extends ElementNode {
  __cellId: string;
  __kind: Cell['type'];
  __source: string | null;
  __baseline: string | null;
  __title: boolean;
  static getType() {
    return 'notebook-cell';
  }
  static clone(node: NotebookCellNode) {
    return new NotebookCellNode(
      node.__cellId,
      node.__kind,
      node.__source,
      node.__baseline,
      node.__title,
      node.__key
    );
  }
  constructor(
    cellId: string = crypto.randomUUID(),
    kind: Cell['type'] = 'markdown',
    source: string | null = null,
    baseline: string | null = null,
    title = false,
    key?: NodeKey
  ) {
    super(key);
    this.__cellId = cellId;
    this.__kind = kind;
    this.__source = source;
    this.__baseline = baseline;
    this.__title = title;
  }
  static importJSON(data: SerializedNotebookCell) {
    return new NotebookCellNode(
      data.cellId,
      data.kind,
      data.source,
      data.baseline,
      data.title
    ).updateFromJSON(data);
  }
  exportJSON(): SerializedNotebookCell {
    return {
      ...super.exportJSON(),
      type: NotebookCellNode.getType(),
      version: 1,
      cellId: this.__cellId,
      kind: this.__kind,
      source: this.__source,
      baseline: this.__baseline,
      title: this.__title,
    };
  }
  createDOM(_config: EditorConfig) {
    const dom = document.createElement('div');
    dom.dataset.cellId = this.__cellId;
    dom.dataset.type = this.__title ? 'title' : 'markdown-cell';
    dom.className = this.__title ? 'notebook-title-node' : 'notebook-markdown-node';
    return dom;
  }
  updateDOM(previous: NotebookCellNode, dom: HTMLElement) {
    if (previous.__cellId !== this.__cellId) dom.dataset.cellId = this.__cellId;
    if (previous.__title !== this.__title) {
      dom.dataset.type = this.__title ? 'title' : 'markdown-cell';
      dom.className = this.__title ? 'notebook-title-node' : 'notebook-markdown-node';
    }
    return false;
  }
  getCellId() {
    return this.getLatest().__cellId;
  }
  isTitle() {
    return this.getLatest().__title;
  }
  setSource(source: string, baseline: string | null = null) {
    const self = this.getWritable();
    self.__source = source;
    self.__baseline = baseline;
    return self;
  }
  getSource(canonical: string) {
    const self = this.getLatest();
    return self.__source !== null && (self.__baseline === null || canonical === self.__baseline)
      ? self.__source
      : canonical;
  }
  captureBaseline(canonical: string) {
    const self = this.getLatest();
    if (self.__source !== null && self.__baseline === null)
      this.getWritable().__baseline = canonical;
  }
  needsBaseline() {
    const self = this.getLatest();
    return self.__source !== null && self.__baseline === null;
  }
  canIndent() {
    return false;
  }
  canBeEmpty() {
    return true;
  }
}
