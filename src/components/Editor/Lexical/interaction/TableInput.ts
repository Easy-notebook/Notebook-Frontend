import { NotebookCellNode } from '../model/NotebookCellNode';
import { $isListItemNode } from '@lexical/list';
import { INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
import { $generateNodesFromMarkdownString } from '@lexical/mdast';
import {
  $deleteTableRowAtSelection,
  $getNodeTriplet,
  $insertTableRowAtSelection,
  $isTableNode,
  $isTableCellNode,
  $isTableRowNode,
} from '@lexical/table';
import {
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  $isTextNode,
  $addUpdateTag,
  HISTORY_PUSH_TAG,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  $createParagraphNode,
  COMMAND_PRIORITY_CRITICAL,
  defineExtension,
  mergeRegister,
} from 'lexical';

/** A complete pipe-bounded header is an explicit Enter shortcut, not a parser
 * rewrite. Escaped pipes stay in cells; incomplete prose is left untouched. */
export function tableHeaderMarkdown(source: string): string | null {
  const text = source.trim();
  if (!text.startsWith('|') || !text.endsWith('|') || text.includes('\n')) return null;
  const boundaries: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\') {
      index++;
      continue;
    }
    if (text[index] === '|') boundaries.push(index);
  }
  if (boundaries.length < 3 || boundaries[boundaries.length - 1] !== text.length - 1) return null;
  const cells = boundaries.slice(1).map((end, index) => text.slice(boundaries[index] + 1, end));
  if (cells.every((cell) => !cell.trim() || /^:?[—–-]+:?$/.test(cell.trim()))) return null;
  return `${text}\n|${cells.map(() => ' --- ').join('|')}|`;
}

export const TableInputExtension = defineExtension({
  name: 'notebook/table-input',
  register: (editor) =>
    mergeRegister(
      ...[KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND].map((command) =>
        editor.registerCommand(
          command,
          (event) => {
            if (!editor.isEditable() || editor.isComposing() || !event.shiftKey) return false;
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return false;
            try {
              const [cell, , table] = $getNodeTriplet(selection.anchor);
              if (!$isTableNode(table)) return false;
              if (cell.hasHeader() || table.getChildrenSize() === 1) {
                const paragraph = $createParagraphNode();
                table.replace(paragraph);
                paragraph.selectStart();
              } else $deleteTableRowAtSelection();
              event.preventDefault();
              return true;
            } catch {
              return false;
            }
          },
          COMMAND_PRIORITY_CRITICAL
        )
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!editor.isEditable() || editor.isComposing()) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
          if (event?.shiftKey) {
            try {
              const [, , table] = $getNodeTriplet(selection.anchor);
              if (!$isTableNode(table)) return false;
              const row = $insertTableRowAtSelection(true);
              row?.getFirstDescendant()?.selectStart();
              $addUpdateTag(HISTORY_PUSH_TAG);
              event.preventDefault();
              return true;
            } catch {
              return false;
            }
          }
          const anchor = selection.anchor.getNode();
          if (
            !$isTextNode(anchor) ||
            anchor.hasFormat('code') ||
            selection.anchor.offset !== anchor.getTextContentSize()
          )
            return false;
          const paragraph = anchor.getParent();
          if (
            !$isParagraphNode(paragraph) ||
            !(paragraph.getParent() instanceof NotebookCellNode) ||
            !anchor.is(paragraph.getLastDescendant())
          )
            return false;
          const markdown = tableHeaderMarkdown(paragraph.getTextContent());
          if (!markdown) return false;
          const nodes = $generateNodesFromMarkdownString(markdown);
          const table = nodes[0];
          if (nodes.length !== 1 || !$isTableNode(table)) return false;
          paragraph.replace(table);
          table.getFirstDescendant()?.selectStart();
          const row = $insertTableRowAtSelection(true);
          row?.getFirstDescendant()?.selectStart();
          $addUpdateTag(HISTORY_PUSH_TAG);
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (!editor.isEditable() || editor.isComposing()) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
          try {
            const [cell, row, table] = $getNodeTriplet(selection.anchor);
            if (selection.anchor.getNode().getParents().some($isListItemNode)) {
              event.preventDefault();
              return editor.dispatchCommand(
                event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
                undefined
              );
            }
            if (event.shiftKey) return false;
            if (
              !$isTableCellNode(cell) ||
              !$isTableRowNode(row) ||
              !cell.is(row.getLastChild()) ||
              !row.is(table.getLastChild())
            )
              return false;
            const inserted = $insertTableRowAtSelection(true);
            inserted?.getFirstDescendant()?.selectStart();
            event.preventDefault();
            $addUpdateTag(HISTORY_PUSH_TAG);
            return true;
          } catch {
            return false;
          }
        },
        COMMAND_PRIORITY_CRITICAL
      )
    ),
});
