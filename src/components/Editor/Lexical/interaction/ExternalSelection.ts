import {
  $getRoot,
  $getSelection,
  $setSelection,
  $getNodeByKey,
  $isRangeSelection,
  $isNodeSelection,
  $createNodeSelection,
  type PointType,
} from 'lexical';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
/** External replacement detaches subtrees. Never let native selection transforms
 * inspect their old keys; restore live keys or a bounded text offset afterwards. */
export function suspendExternalSelection() {
  const selection = $getSelection()?.clone() ?? null;
  const bookmark = (point: PointType) => {
    const node = $getNodeByKey(point.key);
    const cell = $cellAncestor(node);
    let offset = point.offset;
    if (cell instanceof NotebookCellNode) {
      for (const text of cell.getAllTextNodes()) {
        if (text.getKey() === point.key) break;
        offset += text.getTextContentSize();
      }
    }
    return { cellId: cell?.getCellId(), offset };
  };
  const points = $isRangeSelection(selection)
    ? [bookmark(selection.anchor), bookmark(selection.focus)]
    : [];
  const selectedKeys = $isNodeSelection(selection)
    ? selection.getNodes().map((node) => node.getKey())
    : [];
  $setSelection(null);
  return () => {
    if ($isNodeSelection(selection)) {
      const restored = $createNodeSelection();
      for (const key of selectedKeys) if ($getNodeByKey(key)?.isAttached()) restored.add(key);
      if (restored.getNodes().length) $setSelection(restored);
      return;
    }
    if (!$isRangeSelection(selection)) return;
    const remap = (point: PointType, saved: (typeof points)[number]) => {
      const original = $getNodeByKey(point.key);
      if (original?.isAttached()) return true;
      const cell = $getRoot()
        .getChildren()
        .find((node) => node instanceof NotebookCellNode && node.getCellId() === saved.cellId);
      if (!(cell instanceof NotebookCellNode)) return false;
      const texts = cell.getAllTextNodes();
      let offset = saved.offset;
      for (const text of texts) {
        if (offset <= text.getTextContentSize() || text === texts[texts.length - 1]) {
          point.set(text.getKey(), Math.min(offset, text.getTextContentSize()), 'text');
          return true;
        }
        offset -= text.getTextContentSize();
      }
      point.set(cell.getKey(), 0, 'element');
      return true;
    };
    if (remap(selection.anchor, points[0]) && remap(selection.focus, points[1]))
      $setSelection(selection);
  };
}
