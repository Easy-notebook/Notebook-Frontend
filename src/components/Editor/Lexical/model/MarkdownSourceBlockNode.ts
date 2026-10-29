import {
  ElementNode,
  $createParagraphNode,
  type RangeSelection,
  type EditorConfig,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';
export type SourceBlockKind =
  | 'paragraph'
  | 'quote'
  | 'bullet'
  | 'number'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6';
type SerializedBlock = Spread<{ kind: SourceBlockKind }, SerializedElementNode>;
/** Editable source retains its identity while its parsed block semantics change. */
export class MarkdownSourceBlockNode extends ElementNode {
  __kind: SourceBlockKind;
  static getType() {
    return 'notebook-source-block';
  }
  static clone(node: MarkdownSourceBlockNode) {
    return new MarkdownSourceBlockNode(node.__kind, node.__key);
  }
  constructor(kind: SourceBlockKind = 'paragraph', key?: NodeKey) {
    super(key);
    this.__kind = kind;
  }
  static importJSON(data: SerializedBlock) {
    return new MarkdownSourceBlockNode(data.kind).updateFromJSON(data);
  }
  exportJSON(): SerializedBlock {
    return { ...super.exportJSON(), type: MarkdownSourceBlockNode.getType(), kind: this.getKind() };
  }
  getKind() {
    return this.getLatest().__kind;
  }
  setKind(kind: SourceBlockKind) {
    if (this.getKind() !== kind) this.getWritable().__kind = kind;
  }
  insertNewAfter(_selection: RangeSelection, restoreSelection = true) {
    const paragraph = $createParagraphNode();
    this.insertAfter(paragraph, restoreSelection);
    return paragraph;
  }
  createDOM(_config: EditorConfig) {
    const kind = this.getKind();
    const tag =
      kind === 'paragraph'
        ? 'p'
        : kind === 'quote'
          ? 'blockquote'
          : kind === 'bullet'
            ? 'ul'
            : kind === 'number'
              ? 'ol'
              : kind;
    const dom = document.createElement(tag);
    dom.dataset.sourceBlock = kind;
    if (kind === 'bullet' || kind === 'number') {
      const item = document.createElement('li');
      item.style.listStyle = 'none'; // The editable source already contains its marker.
      dom.append(item);
    }
    return dom;
  }
  getDOMSlot(dom: HTMLElement) {
    const slot = super.getDOMSlot(dom);
    return dom.tagName === 'UL' || dom.tagName === 'OL'
      ? slot.withElement(dom.firstElementChild as HTMLElement)
      : slot;
  }
  updateDOM(previous: MarkdownSourceBlockNode) {
    return previous.__kind !== this.__kind;
  }
}
