import { $createParagraphNode, type LexicalNode } from 'lexical';
import { ColumnsNode, ColumnNode, $createColumns, $createColumn } from './ColumnNodes';
import { equalColumns } from './ColumnModel';
import { NotebookCellNode } from '../model/NotebookCellNode';
const $isDocumentTitleNode = (node: LexicalNode) =>
  node instanceof NotebookCellNode && node.isTitle();
export function $wrapColumns(nodes: readonly LexicalNode[], count: number): ColumnsNode | null {
  const widths = equalColumns(count);
  if (
    !nodes.length ||
    nodes.some((node) => $isDocumentTitleNode(node) || node.getParent() !== nodes[0].getParent())
  )
    return null;
  const layout = $createColumns(widths);
  nodes[0].insertBefore(layout);
  for (let index = 0; index < count; index++) {
    const column = $createColumn();
    layout.append(column);
    const members = nodes.filter(
      (_, at) => Math.min(count - 1, Math.floor((at * count) / nodes.length)) === index
    );
    column.append(...(members.length ? members : [$createParagraphNode()]));
  }
  layout.getFirstDescendant()?.selectStart();
  return layout;
}
export function $setColumnCount(layout: ColumnsNode, count: number): void {
  const widths = equalColumns(count);
  const columns = layout.getChildren<ColumnNode>();
  if (columns.length === count) return;
  if (columns.length > count) {
    const last = columns[count - 1];
    for (const column of columns.slice(count)) {
      last.append(...column.getChildren());
      column.remove();
    }
  } else
    for (let index = columns.length; index < count; index++)
      layout.append($createColumn().append($createParagraphNode()));
  layout.setWidths(widths);
}
export function $unwrapColumns(layout: ColumnsNode): void {
  const blocks = layout.getChildren<ColumnNode>().flatMap((column) => column.getChildren());
  for (const block of blocks) layout.insertBefore(block);
  layout.remove();
  blocks[0]?.selectStart();
}
