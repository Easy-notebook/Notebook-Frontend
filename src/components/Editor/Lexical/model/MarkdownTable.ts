import { $generateHtmlFromNodes } from '@lexical/html';
import { configExtension } from '@lexical/extension';
import {
  MdastImportExtension,
  type MdastExportHandler,
  type MdastImportHandler,
} from '@lexical/mdast';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  type TableNode,
} from '@lexical/table';
import {
  $createParagraphNode,
  $createNodeSelection,
  $getEditor,
  $isParagraphNode,
  $getState,
  $isElementNode,
  $setState,
  createState,
  defineExtension,
} from 'lexical';
import type { AlignType, Table, TableCell, TableRow } from 'mdast';

export type MarkdownTableAlignment = Exclude<AlignType, null>;

const parseAlignment = (value: unknown): AlignType =>
  value === 'left' || value === 'center' || value === 'right' ? value : null;

const sameAlignments = (left: AlignType[], right: AlignType[]) =>
  left.length === right.length && left.every((alignment, index) => alignment === right[index]);

/** Public table alignment state owned by this application extension. */
export const markdownTableAlignState = createState('notebookMarkdownTableAlign', {
  isEqual: sameAlignments,
  parse: (value): AlignType[] => (Array.isArray(value) ? value.map(parseAlignment) : []),
});

const $importTable: MdastImportHandler<Table> = (node, context) => {
  const table = $createTableNode();
  const alignments = node.align?.map(parseAlignment) || [];
  $setState(table, markdownTableAlignState, alignments);
  node.children.forEach((row, rowIndex) => {
    const rowNode = $createTableRowNode();
    row.children.forEach((cell, columnIndex) => {
      const cellNode = $createTableCellNode(
        rowIndex === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS
      );
      const paragraph = $createParagraphNode();
      paragraph.setFormat(alignments[columnIndex] || '');
      paragraph.append(...context.importChildren(cell));
      cellNode.append(paragraph);
      rowNode.append(cellNode);
    });
    table.append(rowNode);
  });
  return table;
};

const $exportTable: MdastExportHandler = (node, context) => {
  if (!$isTableNode(node)) return null;
  // Pipe tables represent phrasing content only. Once a cell contains multiple
  // blocks or a non-paragraph block, use standard semantic HTML instead of
  // flattening its structure. The existing HTML importer is the inverse.
  const rich =
    !!node.getColWidths() ||
    node
      .getChildren()
      .some(
        (row) =>
          $isTableRowNode(row) &&
          row
            .getChildren()
            .some(
              (cell) =>
                $isTableCellNode(cell) &&
                (cell.getWidth() !== undefined ||
                  cell.getColSpan() > 1 ||
                  cell.getRowSpan() > 1 ||
                  cell.getChildrenSize() !== 1 ||
                  !$isParagraphNode(cell.getFirstChild()))
            )
      );
  if (rich) {
    const selection = $createNodeSelection();
    selection.add(node.getKey());
    const html = new DOMParser().parseFromString(
      $generateHtmlFromNodes($getEditor(), selection),
      'text/html'
    );
    // Export only semantic markup, not theme classes or Lexical's default
    // clipboard borders/75px cell widths. Preserve authored text formatting.
    html.querySelectorAll('[class]').forEach((element) => element.removeAttribute('class'));
    html.querySelectorAll<HTMLElement>('td,th').forEach((element) => {
      const align = element.style.textAlign;
      const width = element.style.width;
      if (width) element.setAttribute('colwidth', String(Math.round(parseFloat(width))));
      element.removeAttribute('style');
      if (align && align !== 'start') element.style.textAlign = align;
    });
    const value = html.body.innerHTML.replace(
      />([^<]*)</g,
      (_match, text: string) =>
        '>' + text.replace(/[\\`*_[\]~$\n]/g, (character) => `&#${character.charCodeAt(0)};`) + '<'
    );
    return { type: 'html', value };
  }
  const rows: TableRow[] = [];
  node.getChildren().forEach((row) => {
    if (!$isTableRowNode(row) || !context.isIncluded(row)) return;
    const cells: TableCell[] = [];
    row.getChildren().forEach((cell) => {
      if (!$isTableCellNode(cell)) return;
      const children: TableCell['children'] = [];
      cell.getChildren().forEach((child) => {
        if (!$isElementNode(child)) return;
        if (children.length > 0) children.push({ type: 'break' });
        children.push(...context.exportInline(child));
      });
      cells.push({ children, type: 'tableCell' });
    });
    rows.push({ children: cells, type: 'tableRow' });
  });
  return {
    align: $getState(node, markdownTableAlignState),
    children: rows,
    type: 'table',
  } as Table;
};

/**
 * Overrides only the table import/export handlers contributed by the official
 * GFM extension. Tokenization and Lexical table nodes remain official; this
 * closer-to-root mapping exposes alignment as an application-owned state.
 */
export const MarkdownTableSemanticsExtension = defineExtension({
  dependencies: [
    configExtension(MdastImportExtension, {
      exportRules: [{ $export: $exportTable, type: 'table' }],
      importRules: [{ $import: $importTable, type: 'table' }],
    }),
  ],
  name: 'notebook/markdown-table-semantics',
});

export function $getMarkdownTableAlignments(table: TableNode) {
  return $getState(table, markdownTableAlignState);
}

export function $setMarkdownTableAlignments(table: TableNode, alignments: readonly AlignType[]) {
  const normalized = alignments.map(parseAlignment);
  $setState(table, markdownTableAlignState, normalized);
  table.getChildren().forEach((row) => {
    if (!$isTableRowNode(row)) return;
    row.getChildren().forEach((cell, columnIndex) => {
      if (!$isTableCellNode(cell)) return;
      cell.getChildren().forEach((child) => {
        if ($isElementNode(child)) child.setFormat(normalized[columnIndex] || '');
      });
    });
  });
}

export function $setMarkdownTableColumnAlignment(
  table: TableNode,
  columnIndex: number,
  alignment: MarkdownTableAlignment
) {
  const alignments = [...$getMarkdownTableAlignments(table)];
  const firstRow = table.getFirstChild();
  const columnCount = $isTableRowNode(firstRow) ? firstRow.getChildrenSize() : 0;
  while (alignments.length < columnCount) alignments.push(null);
  alignments[columnIndex] = alignment;
  $setMarkdownTableAlignments(table, alignments);
}

export function $insertMarkdownTableAlignment(table: TableNode, columnIndex: number) {
  const alignments = [...$getMarkdownTableAlignments(table)];
  alignments.splice(columnIndex, 0, null);
  $setMarkdownTableAlignments(table, alignments);
}

export function $deleteMarkdownTableAlignment(table: TableNode, columnIndex: number) {
  const alignments = [...$getMarkdownTableAlignments(table)];
  alignments.splice(columnIndex, 1);
  $setMarkdownTableAlignments(table, alignments);
}
