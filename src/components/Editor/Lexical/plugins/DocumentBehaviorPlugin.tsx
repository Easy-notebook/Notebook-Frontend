import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
  $isElementNode,
  RootNode,
  type LexicalEditor,
} from 'lexical';
import { $createHeadingNode, $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { mergeRegister } from '@lexical/utils';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { EmbeddedCellNode } from '../model/EmbeddedCellNode';
import { $cellAncestor } from '../model/NotebookDocument';

export function registerDocumentBehavior(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerNodeTransform(NotebookCellNode, (cell) => {
      if (!cell.isTitle()) return;
      const first = cell.getFirstChild();
      if (!$isHeadingNode(first) || first.getTag() !== 'h1') {
        const heading = $createHeadingNode('h1');
        if ($isParagraphNode(first) || $isHeadingNode(first)) {
          heading.append(...first.getChildren());
          first.replace(heading);
        } else if (first) first.insertBefore(heading);
        else cell.append(heading);
      }
      const extra = cell.getChildren().slice(1);
      if (extra.length) {
        const body = new NotebookCellNode();
        cell.insertAfter(body);
        body.append(...extra);
      }
    }),
    editor.registerNodeTransform(RootNode, (root) => {
      // Native Markdown/clipboard commands can produce root blocks; wrap them once at the boundary.
      for (const child of root.getChildren()) {
        if (child instanceof NotebookCellNode || child instanceof EmbeddedCellNode) continue;
        const wrapper = new NotebookCellNode();
        child.insertBefore(wrapper);
        wrapper.append(child);
      }
      if (!root.getChildrenSize())
        root.append(
          new NotebookCellNode(crypto.randomUUID(), 'markdown', '# ', '', true).append(
            $createHeadingNode('h1')
          )
        );
    }),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (
          !editor.isEditable() ||
          event?.isComposing ||
          event?.altKey ||
          event?.metaKey ||
          event?.ctrlKey ||
          event?.shiftKey
        )
          return false;
        const selection = $getSelection();
        if (
          !$isRangeSelection(selection) ||
          !selection.isCollapsed() ||
          selection.anchor.offset !== 0
        )
          return false;
        let block = selection.anchor.getNode();
        while (!$isHeadingNode(block) && !$isQuoteNode(block)) {
          if (block.getPreviousSibling()) return false;
          const parent = block.getParent();
          if (!parent || parent instanceof NotebookCellNode) return false;
          block = parent;
        }
        const cell = $cellAncestor(block);
        if (!(cell instanceof NotebookCellNode)) return false;
        event?.preventDefault();
        if (cell.isTitle()) return true;
        if ($isElementNode(block)) {
          const paragraph = $createParagraphNode().append(...block.getChildren());
          block.replace(paragraph);
          paragraph.selectStart();
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH
    ),
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!editor.isEditable() || event?.isComposing || event?.shiftKey) return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        const cell = $cellAncestor(selection.anchor.getNode());
        if (!(cell instanceof NotebookCellNode) || !cell.isTitle()) return false;
        event?.preventDefault();
        const next = selection.insertParagraph();
        if (!next) return true;
        const paragraph = $createParagraphNode();
        paragraph.append(...next.getChildren());
        next.replace(paragraph);
        const body = new NotebookCellNode();
        cell.insertAfter(body);
        body.append(paragraph);
        paragraph.selectStart();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    )
  );
}
export function DocumentBehaviorPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerDocumentBehavior(editor), [editor]);
  return null;
}
