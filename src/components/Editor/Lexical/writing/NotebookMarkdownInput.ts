import {
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  $isTextNode,
  $isElementNode,
  $createParagraphNode,
  $isLineBreakNode,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $addUpdateTag,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from 'lexical';
import { $generateNodesFromMarkdownString } from '@lexical/mdast';
import { $isQuoteNode } from '@lexical/rich-text';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';

/** Commit Markdown at the writing line boundary inside notebook-owned containers. */
export function registerNotebookMarkdownInput(editor: LexicalEditor) {
  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      if (
        !editor.isEditable() ||
        editor.isComposing() ||
        event?.isComposing ||
        event?.shiftKey ||
        event?.metaKey ||
        event?.ctrlKey
      )
        return false;
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const anchor = selection.anchor.getNode();
      const block = $isTextNode(anchor) ? anchor.getParent() : anchor;
      const cell = $cellAncestor(block);
      if (!(cell instanceof NotebookCellNode) || cell.isTitle() || !block) return false;
      if ($isQuoteNode(block)) {
        const atEnd =
          ($isTextNode(anchor) &&
            anchor.getNextSibling() === null &&
            selection.anchor.offset === anchor.getTextContentSize()) ||
          (anchor === block && selection.anchor.offset === block.getChildrenSize());
        if (!atEnd) return false;
        event?.preventDefault();
        if ($isLineBreakNode(block.getLastChild()) || !block.getTextContent().trim()) {
          const last = block.getLastChild();
          if ($isLineBreakNode(last)) last.remove();
          const paragraph = $createParagraphNode();
          block.insertAfter(paragraph);
          paragraph.selectStart();
          if (!block.getTextContent().trim()) block.remove();
        } else selection.insertLineBreak();
        $addUpdateTag(HISTORY_PUSH_TAG);
        return true;
      }
      if (
        !$isParagraphNode(block) ||
        !$isTextNode(anchor) ||
        anchor.getNextSibling() ||
        selection.anchor.offset !== anchor.getTextContentSize()
      )
        return false;
      if (block.getChildren().some((node) => !$isTextNode(node) || node.getFormat() !== 0))
        return false;
      const source = block.getTextContent();
      if (
        !/^(?:#{1,6}[ \t]+|>[ \t]?|(?:[-+*]|\d{1,9}[.)])[ \t]+|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(
          source
        )
      )
        return false;
      // Code fences retain the executable-cell promotion path in FenceInputPlugin.
      const nodes = $generateNodesFromMarkdownString(source);
      if (
        !nodes.length ||
        (nodes.length === 1 && $isParagraphNode(nodes[0]) && nodes[0].getTextContent() === source)
      )
        return false;
      event?.preventDefault();
      let last = nodes[0];
      block.replace(last);
      for (const node of nodes.slice(1)) {
        last.insertAfter(node);
        last = node;
      }
      if ($isQuoteNode(last)) last.selectEnd().insertLineBreak();
      else if ($isElementNode(last)) last.selectEnd().insertParagraph();
      else {
        const paragraph = $createParagraphNode();
        last.insertAfter(paragraph);
        paragraph.selectStart();
      }
      $addUpdateTag(HISTORY_PUSH_TAG);
      return true;
    },
    COMMAND_PRIORITY_HIGH
  );
}
