import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isTextNode,
  $createNodeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { EmbeddedCellNode } from '../model/EmbeddedCellNode';
import type { NotebookEditorSession } from './NotebookEditorSession';

/** Rich text and embedded editors own separate selections. Transfer ownership at boundaries. */
export function registerCellBoundaryNavigation(
  editor: LexicalEditor,
  session: NotebookEditorSession
) {
  const transfer = (event: KeyboardEvent | null, backwards: boolean) => {
    if (
      !session.owns() ||
      !editor.isEditable() ||
      event?.isComposing ||
      event?.shiftKey ||
      event?.metaKey ||
      event?.ctrlKey ||
      event?.altKey
    )
      return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const point = selection.anchor;
    let node = point.getNode();
    const cell = $cellAncestor(node);
    if (!(cell instanceof NotebookCellNode)) return false;
    const size = $isTextNode(node)
      ? node.getTextContentSize()
      : $isElementNode(node)
        ? node.getChildrenSize()
        : 0;
    if (point.offset !== (backwards ? 0 : size)) return false;
    while (node !== cell) {
      if (backwards ? node.getPreviousSibling() : node.getNextSibling()) return false;
      const parent = node.getParent();
      if (!parent) return false;
      node = parent;
    }
    const target = backwards ? cell.getPreviousSibling() : cell.getNextSibling();
    if (!(target instanceof EmbeddedCellNode)) return false;
    event?.preventDefault();
    const next = $createNodeSelection();
    next.add(target.getKey());
    $setSelection(next);
    session.focusEmbeddedCell(target.getCellId(), backwards ? 'up' : 'down');
    return true;
  };
  return mergeRegister(
    ...[KEY_ARROW_UP_COMMAND, KEY_ARROW_LEFT_COMMAND, KEY_BACKSPACE_COMMAND].map((command) =>
      editor.registerCommand(command, (event) => transfer(event, true), COMMAND_PRIORITY_HIGH)
    ),
    ...[KEY_ARROW_DOWN_COMMAND, KEY_ARROW_RIGHT_COMMAND, KEY_DELETE_COMMAND].map((command) =>
      editor.registerCommand(command, (event) => transfer(event, false), COMMAND_PRIORITY_HIGH)
    )
  );
}
