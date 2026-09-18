import type { Editor } from '@tiptap/react';
import { DOMParser as ProseMirrorDOMParser, Fragment } from 'prosemirror-model';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Cell } from '@Store/models';
import { convertCellsToHtml } from '@Editor/utils/cellConverters';

export const EXTERNAL_CELL_SYNC = 'externalCellSync';

function sameProjectedNode(current: ProseMirrorNode, next: ProseMirrorNode): boolean {
  // CodeMirror and the Cell Store own executable text and outputs. Their NodeView
  // subscribes to the store, so replacing that ProseMirror node would steal focus.
  if (current.type.name === 'executableCodeBlock' && next.type.name === current.type.name) {
    return (
      current.attrs.cellId === next.attrs.cellId &&
      current.attrs.originalType === next.attrs.originalType
    );
  }
  return current.eq(next);
}

export function changedBlockRange(
  current: readonly ProseMirrorNode[],
  next: readonly ProseMirrorNode[]
): { start: number; oldEnd: number; newEnd: number } | null {
  let start = 0;
  while (
    start < current.length &&
    start < next.length &&
    sameProjectedNode(current[start], next[start])
  ) {
    start++;
  }
  if (start === current.length && start === next.length) return null;

  let oldEnd = current.length;
  let newEnd = next.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    sameProjectedNode(current[oldEnd - 1], next[newEnd - 1])
  ) {
    oldEnd--;
    newEnd--;
  }
  return { start, oldEnd, newEnd };
}

/** Apply external Cell changes at top-level block boundaries in one transaction. */
export function synchronizeDocument(editor: Editor, cells: Cell[]): boolean {
  if (editor.isDestroyed) return false;

  const container = document.createElement('div');
  container.innerHTML = convertCellsToHtml(cells);
  const projected = ProseMirrorDOMParser.fromSchema(editor.schema).parse(container);
  const currentBlocks: ProseMirrorNode[] = [];
  const nextBlocks: ProseMirrorNode[] = [];
  editor.state.doc.forEach((node) => currentBlocks.push(node));
  projected.forEach((node) => nextBlocks.push(node));

  const range = changedBlockRange(currentBlocks, nextBlocks);
  if (!range) return false;

  const from = currentBlocks.slice(0, range.start).reduce((pos, node) => pos + node.nodeSize, 0);
  const to = currentBlocks
    .slice(range.start, range.oldEnd)
    .reduce((pos, node) => pos + node.nodeSize, from);
  const replacement = Fragment.fromArray(nextBlocks.slice(range.start, range.newEnd));
  const scroller = editor.view.dom.closest('.tiptap-editor') as HTMLElement | null;
  const scrollTop = scroller?.scrollTop;
  const transaction = editor.state.tr
    .replaceWith(from, to, replacement)
    .setMeta(EXTERNAL_CELL_SYNC, true)
    .setMeta('addToHistory', false);
  editor.view.dispatch(transaction);
  if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  return true;
}
