import { isFoldableBlock, setBlockDisclosure } from './BlockDisclosure';
import {
  $applyNodeReplacement,
  $getNodeByKey,
  ElementNode,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';
import { parseBlockMetadata, type BlockMetadata } from './BlockMetadata';
type SerializedPersistentBlock = SerializedElementNode & { metadata: BlockMetadata };
export class PersistentBlockNode extends ElementNode {
  __metadata: BlockMetadata;
  static getType() {
    return 'persistent-block';
  }
  static clone(node: PersistentBlockNode) {
    return new PersistentBlockNode(node.__metadata, node.__key);
  }
  static importJSON(data: SerializedPersistentBlock) {
    if (data.version !== 1) throw Error('Unsupported persistent block node version');
    return new PersistentBlockNode(parseBlockMetadata(data.metadata)).updateFromJSON(data);
  }
  constructor(metadata: BlockMetadata, key?: NodeKey) {
    super(key);
    this.__metadata = parseBlockMetadata(metadata);
  }
  metadata(): BlockMetadata {
    return this.getLatest().__metadata;
  }
  setMetadata(metadata: BlockMetadata): void {
    this.getWritable().__metadata = parseBlockMetadata(metadata);
  }
  exportJSON(): SerializedPersistentBlock {
    return {
      ...super.exportJSON(),
      type: 'persistent-block',
      version: 1,
      metadata: this.metadata(),
    };
  }
  createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const element = document.createElement('section');
    const header = document.createElement('div');
    header.className = 'persistent-block-header';
    header.contentEditable = 'false';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editor.isEditable()) {
        setBlockDisclosure(element, element.dataset.collapsed !== 'true');
        return;
      }
      editor.update(() => {
        const node = $getNodeByKey(this.__key);
        if (node instanceof PersistentBlockNode)
          node.setMetadata({ ...node.metadata(), collapsed: !node.metadata().collapsed });
      });
    });
    header.append(toggle);
    const body = document.createElement('div');
    body.className = 'persistent-block-body';
    element.append(header, body);
    this.applyDOM(element);
    return element;
  }
  getDOMSlot(element: HTMLElement) {
    return super.getDOMSlot(element).withElement(element.lastElementChild as HTMLElement);
  }
  updateDOM(_previous: this, element: HTMLElement): boolean {
    this.applyDOM(element);
    return false;
  }
  private applyDOM(element: HTMLElement) {
    const metadata = this.metadata();
    element.className = 'persistent-block';
    element.dataset.kind = metadata.kind;
    element.dataset.blockId = metadata.id;
    element.id = 'block-' + metadata.id;
    element.style.color = metadata.foreground ?? '';
    element.style.backgroundColor = metadata.background ?? '';
    const header = element.firstElementChild as HTMLElement;
    const button = header.firstElementChild as HTMLButtonElement;
    header.hidden = metadata.kind === 'group';
    button.textContent =
      (metadata.kind === 'toggle' ? (metadata.collapsed ? '▸ ' : '▾ ') : 'ⓘ ') + metadata.title;
    button.disabled = !isFoldableBlock(metadata.kind);
    button.removeAttribute('aria-label');
    setBlockDisclosure(element, metadata.collapsed);
  }
  canBeEmpty() {
    return false;
  }
}
export function $createPersistentBlock(metadata: BlockMetadata): PersistentBlockNode {
  return $applyNodeReplacement(new PersistentBlockNode(metadata));
}
