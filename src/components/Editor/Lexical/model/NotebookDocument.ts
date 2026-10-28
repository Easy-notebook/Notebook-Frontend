import { MarkdownSourceExtension } from './MarkdownSourceNode';
import {
  $createParagraphNode,
  $getRoot,
  $setSelection,
  RootNode,
  configExtension,
  defineExtension,
  type LexicalNode,
} from 'lexical';
import {
  MdastCommonMarkExtension,
  MdastExtension,
  MdastGfmExtension,
  MdastHtmlExtension,
  MdastShortcutsExtension,
  $generateNodesFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/mdast';
import { CodeExtension } from '@lexical/code-core';
import { DOMImportExtension } from '@lexical/html';
import { TableImportRules } from '@lexical/table';
import { RichTextExtension, $createHeadingNode } from '@lexical/rich-text';
import { ListImportRules } from '@lexical/list';
import type { Cell } from '@Store/models';
import { isNotebookTitleCell } from '../../utils/documentTitle';
import { NotebookCellNode } from './NotebookCellNode';
import { EmbeddedCellNode } from './EmbeddedCellNode';
import type { NotebookPluginRegistry } from '../extensionPoints';

export const EXTERNAL_NOTEBOOK_SYNC = 'external-notebook-sync';
export function $createCellNode(cell: Cell, title = false): NotebookCellNode | EmbeddedCellNode {
  if (cell.type !== 'markdown' || cell.metadata?.editorMode === 'source')
    return new EmbeddedCellNode(cell);
  const node = new NotebookCellNode(cell.id, cell.type, cell.content, null, title);
  const children = $generateNodesFromMarkdownString(cell.content);
  if (title && (!children.length || /^#\s*$/.test(cell.content)))
    node.append($createHeadingNode('h1'));
  else node.append(...(children.length ? children : [$createParagraphNode()]));
  node.setSource(cell.content);
  return node;
}
export function $loadCells(cells: readonly Cell[]) {
  const root = $getRoot();
  root.clear();
  cells.forEach((cell, index) =>
    root.append($createCellNode(cell, index === 0 && isNotebookTitleCell(cell)))
  );
  if (!root.getChildrenSize())
    root.append(
      $createCellNode(
        { id: crypto.randomUUID(), type: 'markdown', content: '# ', outputs: [] },
        true
      )
    );
}
export function $cellAncestor(
  node: LexicalNode | null
): NotebookCellNode | EmbeddedCellNode | null {
  while (node) {
    if (node instanceof NotebookCellNode || node instanceof EmbeddedCellNode) return node;
    node = node.getParent();
  }
  return null;
}
export function $readCells(
  resolve: (id: string) => Cell | undefined,
  changedCellIds?: ReadonlySet<string>
): Cell[] {
  return $getRoot()
    .getChildren()
    .flatMap((node): Cell[] => {
      if (node instanceof EmbeddedCellNode) {
        return [node.toCell(resolve(node.getCellId()))];
      }
      if (!(node instanceof NotebookCellNode)) return [];
      const old = resolve(node.getCellId());
      if (old && changedCellIds && !changedCellIds.has(node.getCellId())) return [old];
      const content =
        node.isTitle() && !node.getTextContent()
          ? '# '
          : node.getSource($convertToMarkdownString(node));
      return [
        { ...old, id: node.getCellId(), type: 'markdown', content, outputs: old?.outputs ?? [] },
      ];
    });
}
export function createNotebookExtension(
  cells: readonly Cell[],
  readOnly: boolean,
  registry: NotebookPluginRegistry
) {
  return defineExtension({
    name: 'notebook/document',
    namespace: 'notebook-editor',
    editable: !readOnly,
    nodes: [NotebookCellNode, EmbeddedCellNode, ...registry.nodes()],
    dependencies: [
      RichTextExtension,
      MarkdownSourceExtension,
      MdastCommonMarkExtension,
      MdastGfmExtension,
      MdastHtmlExtension,
      MdastExtension,
      CodeExtension,
      defineExtension({
        name: 'notebook/html-blocks',
        dependencies: [
          configExtension(DOMImportExtension, { rules: [...ListImportRules, ...TableImportRules] }),
        ],
      }),
      configExtension(MdastShortcutsExtension, { disabled: readOnly }),
      ...registry.extensions(),
    ],
    register: (editor) =>
      editor.registerNodeTransform(RootNode, (root) => {
        for (const node of root.getChildren())
          if (node instanceof NotebookCellNode && node.needsBaseline())
            node.captureBaseline($convertToMarkdownString(node));
      }),
    $initialEditorState: () => {
      $loadCells(cells);
      $setSelection(null);
    },
    onError: (error: Error) => {
      throw error;
    },
    theme: {
      text: {
        bold: 'notebook-text-bold',
        italic: 'notebook-text-italic',
        strikethrough: 'notebook-text-strike',
        code: 'notebook-text-code',
        underline: 'notebook-text-underline',
      },
      heading: {
        h1: 'notebook-heading',
        h2: 'notebook-heading',
        h3: 'notebook-heading',
        h4: 'notebook-heading',
        h5: 'notebook-heading',
        h6: 'notebook-heading',
      },
      list: {
        ul: 'notebook-bullet-list',
        ol: 'notebook-ordered-list',
        listitem: 'notebook-list-item',
        checklist: 'notebook-check-list',
        listitemChecked: 'notebook-list-item-checked',
        listitemUnchecked: 'notebook-list-item-unchecked',
        nested: { listitem: 'notebook-list-nested' },
      },
      table: 'notebook-table',
      tableCell: 'notebook-table-cell',
      tableCellHeader: 'notebook-table-header',
      tableCellSelected: 'notebook-table-cell-selected',
      tableSelection: 'notebook-table-selection',
      link: 'notebook-link',
      code: 'notebook-fenced-code',
      quote: 'notebook-quote',
    },
  });
}
