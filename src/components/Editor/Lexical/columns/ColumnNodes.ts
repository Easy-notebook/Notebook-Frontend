import {
  $applyNodeReplacement,
  ElementNode,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';
import { columnWidths } from './ColumnModel';
import { COLUMN_ACTION } from './ColumnActions';
export class ColumnsNode extends ElementNode {
  __widths: readonly number[];
  static getType() {
    return 'document-columns';
  }
  static clone(node: ColumnsNode) {
    return new ColumnsNode(node.__widths, node.__key);
  }
  constructor(widths: readonly number[], key?: NodeKey) {
    super(key);
    this.__widths = columnWidths(widths);
  }
  widths() {
    return this.getLatest().__widths;
  }
  setWidths(widths: readonly number[]) {
    this.getWritable().__widths = columnWidths(widths);
  }
  exportJSON() {
    return { ...super.exportJSON(), type: 'document-columns', version: 1, widths: this.widths() };
  }
  static importJSON(data: SerializedElementNode & { widths: number[] }) {
    if (data.version !== 1) throw Error('Unsupported columns version');
    return new ColumnsNode(data.widths).updateFromJSON(data);
  }
  createDOM(_config: EditorConfig, editor: LexicalEditor) {
    const element = document.createElement('section');
    element.className = 'document-columns';
    const controls = document.createElement('div');
    controls.className = 'document-columns-controls';
    controls.contentEditable = 'false';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Column layout');
    const label = document.createElement('span');
    label.textContent = 'Columns';
    controls.append(label);
    for (const count of [2, 3, 4]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(count);
      button.setAttribute('aria-label', count + ' columns');
      button.dataset.count = String(count);
      button.addEventListener('click', () =>
        editor.dispatchCommand(COLUMN_ACTION, { key: this.__key, action: 'count', count })
      );
      controls.append(button);
    }
    const unwrap = document.createElement('button');
    unwrap.type = 'button';
    unwrap.textContent = 'Stack';
    unwrap.setAttribute('aria-label', 'Move columns into document');
    unwrap.addEventListener('click', () =>
      editor.dispatchCommand(COLUMN_ACTION, { key: this.__key, action: 'unwrap' })
    );
    controls.append(unwrap);
    const grid = document.createElement('div');
    grid.className = 'document-columns-grid';
    controls.hidden = !editor.isEditable();
    element.dataset.readonly = String(!editor.isEditable());
    element.append(controls, grid);
    this.applyDOM(element);
    return element;
  }
  getDOMSlot(element: HTMLElement) {
    return super.getDOMSlot(element).withElement(element.lastElementChild as HTMLElement);
  }
  updateDOM(_previous: this, element: HTMLElement) {
    this.applyDOM(element);
    return false;
  }
  private applyDOM(element: HTMLElement) {
    const grid = element.lastElementChild as HTMLElement;
    grid.style.gridTemplateColumns = this.widths()
      .map((width) => width + 'fr')
      .join(' ');
    Array.from(grid.children).forEach((column, index) =>
      column.lastElementChild?.setAttribute(
        'aria-valuenow',
        String(Math.round(this.widths()[index] * 100))
      )
    );
    element
      .firstElementChild!.querySelectorAll<HTMLButtonElement>('[data-count]')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(Number(button.dataset.count) === this.widths().length)
        )
      );
  }
  canBeEmpty() {
    return false;
  }
}
export class ColumnNode extends ElementNode {
  static getType() {
    return 'document-column';
  }
  static clone(node: ColumnNode) {
    return new ColumnNode(node.__key);
  }
  static importJSON(data: SerializedElementNode) {
    if (data.version !== 1) throw Error('Unsupported column version');
    return new ColumnNode().updateFromJSON(data);
  }
  exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: 'document-column', version: 1 };
  }
  createDOM(_config: EditorConfig, editor: LexicalEditor) {
    const element = document.createElement('div');
    element.className = 'document-column';
    const body = document.createElement('div');
    body.className = 'document-column-body';
    const divider = document.createElement('button');
    divider.type = 'button';
    divider.contentEditable = 'false';
    divider.className = 'document-column-divider';
    divider.hidden = !editor.isEditable();
    divider.setAttribute('aria-valuemin', '10');
    divider.setAttribute('aria-valuemax', '90');
    divider.setAttribute(
      'aria-valuenow',
      String(
        Math.round(
          ((this.getParent() as ColumnsNode)?.widths()[this.getIndexWithinParent()] || 0.5) * 100
        )
      )
    );
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    divider.setAttribute('aria-label', 'Resize adjacent columns');
    element.append(body, divider);
    return element;
  }
  getDOMSlot(element: HTMLElement) {
    return super.getDOMSlot(element).withElement(element.firstElementChild as HTMLElement);
  }
  updateDOM() {
    return false;
  }
  canBeEmpty() {
    return false;
  }
  isShadowRoot() {
    return true;
  }
}
export function $createColumns(widths: readonly number[]) {
  return $applyNodeReplacement(new ColumnsNode(widths));
}
export function $createColumn() {
  return $applyNodeReplacement(new ColumnNode());
}
