import type { Editor } from '@tiptap/react';
import { DOMParser as ProseMirrorDOMParser, Fragment } from 'prosemirror-model';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Cell } from '@Store/models';
import { convertCellsToHtml, convertEditorStateToCells } from '@Editor/utils/cellConverters';
import { Selection } from 'prosemirror-state';

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

  const currentBlocks: ProseMirrorNode[] = [];
  const nextBlocks: ProseMirrorNode[] = [];
  editor.state.doc.forEach((node) => currentBlocks.push(node));
  const nodesById = new Map(currentBlocks.map((node) => [node.attrs.cellId, node]));
  const projectedById = new Map(convertEditorStateToCells(editor).map((cell) => [cell.id, cell]));
  const hasTitle = cells[0]?.type === 'markdown' && /^#(?:\s|$)/.test(cells[0].content.trim());
  const parser = ProseMirrorDOMParser.fromSchema(editor.schema);
  const container = document.createElement('div');
  if (!hasTitle) {
    const title = currentBlocks[0];
    if (title?.type.name === 'title' && title.content.size === 0) nextBlocks.push(title);
    else {
      container.innerHTML = convertCellsToHtml([]);
      nextBlocks.push(parser.parseSlice(container).content.firstChild!);
    }
  }
  cells.forEach((cell, index) => {
    const current = nodesById.get(cell.id);
    const projected = projectedById.get(cell.id);
    const isTitle = index === 0 && hasTitle;
    const storeOwned = cell.type === 'code' || cell.type === 'hybrid';
    const sameContent =
      projected?.type === cell.type && (storeOwned || projected.content === cell.content);
    const sameMetadata =
      storeOwned ||
      (isTitle
        ? (current?.attrs.cover || null) === (cell.metadata?.cover || null) &&
          (current?.attrs.icon || null) === (cell.metadata?.icon || null)
        : !cell.metadata ||
          Object.keys(cell.metadata).every(
            (key) =>
              JSON.stringify(cell.metadata?.[key]) === JSON.stringify(projected?.metadata?.[key])
          ));
    if (current && sameContent && sameMetadata && (current.type.name === 'title') === isTitle) {
      nextBlocks.push(current);
    } else {
      // Parse only changed cells. Unchanged nodes retain their NodeViews and DOM.
      container.innerHTML = convertCellsToHtml([cell], isTitle);
      nextBlocks.push(parser.parseSlice(container).content.firstChild!);
    }
  });
  const trailing = currentBlocks[currentBlocks.length - 1];
  const hasTrailingParagraph = trailing?.type.name === 'paragraph' && trailing.content.size === 0;
  if (nextBlocks.length === 1 || hasTrailingParagraph) {
    nextBlocks.push(hasTrailingParagraph ? trailing : editor.schema.nodes.paragraph.create());
  }

  const range = changedBlockRange(currentBlocks, nextBlocks);
  if (!range) return false;

  const from = currentBlocks.slice(0, range.start).reduce((pos, node) => pos + node.nodeSize, 0);
  const to = currentBlocks
    .slice(range.start, range.oldEnd)
    .reduce((pos, node) => pos + node.nodeSize, from);
  const replacement = Fragment.fromArray(nextBlocks.slice(range.start, range.newEnd));
  const selectionIndex = editor.state.doc.resolve(editor.state.selection.anchor).index(0);
  const selectedCellId = currentBlocks[selectionIndex]?.attrs.cellId as string | undefined;
  const selectedBlockStart = currentBlocks
    .slice(0, selectionIndex)
    .reduce((pos, node) => pos + node.nodeSize, 0);
  const selectedOffset = editor.state.selection.anchor - selectedBlockStart;
  const scroller = editor.view.dom.closest('.tiptap-editor') as HTMLElement | null;
  const scrollTop = scroller?.scrollTop;
  const transaction = editor.state.tr
    .setMeta(EXTERNAL_CELL_SYNC, true)
    .setMeta('addToHistory', false);
  const oldBlock = currentBlocks[range.start];
  const newBlock = nextBlocks[range.start];
  const sameCell =
    range.oldEnd === range.start + 1 &&
    range.newEnd === range.start + 1 &&
    oldBlock.sameMarkup(newBlock) &&
    !oldBlock.isLeaf;
  if (sameCell) {
    // Preserve text selection mapping inside a changed cell, not just its ID.
    const start = oldBlock.content.findDiffStart(newBlock.content);
    const end = oldBlock.content.findDiffEnd(newBlock.content);
    if (start === null || end === null) return false;
    const overlap = Math.max(0, start - Math.min(end.a, end.b));
    transaction.replace(
      from + 1 + start,
      from + 1 + end.a + overlap,
      newBlock.slice(start, end.b + overlap)
    );
  } else {
    transaction.replaceWith(from, to, replacement);
  }
  if (
    !sameCell &&
    selectedCellId &&
    selectionIndex >= range.start &&
    selectionIndex < range.oldEnd
  ) {
    const targetIndex = nextBlocks.findIndex((node) => node.attrs.cellId === selectedCellId);
    if (targetIndex >= 0) {
      const targetStart = nextBlocks
        .slice(0, targetIndex)
        .reduce((pos, node) => pos + node.nodeSize, 0);
      const position = targetStart + Math.min(selectedOffset, nextBlocks[targetIndex].nodeSize - 1);
      transaction.setSelection(Selection.near(transaction.doc.resolve(position)));
    }
  }
  editor.view.dispatch(transaction);
  if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  return true;
}
