import type { Editor } from '@tiptap/react';
import { DOMParser as ProseMirrorDOMParser, Fragment } from 'prosemirror-model';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Cell } from '@Store/models';
import { convertCellsToHtml, convertEditorStateToCells } from '@Editor/utils/cellConverters';
import { Selection } from 'prosemirror-state';
import { parseSourceCellType } from '../../utils/sourceCellAttributes';
import { structuralBlockRanges, type BlockReplacementRange } from './structuralBlockRanges';

export const EXTERNAL_CELL_SYNC = 'externalCellSync';

function samePresentation(
  current: ProseMirrorNode | undefined,
  cell: Cell,
  isTitle: boolean
): boolean {
  if (cell.type === 'code' || cell.type === 'hybrid') return true;
  // These nodes have no metadata-derived presentation. Business payloads may
  // be large and must not be traversed just to decide whether to retain a view.
  if (cell.type === 'raw' || cell.type === 'link' || cell.type === 'image') return true;
  if (cell.type === 'thinking') {
    const attrs = current?.attrs;
    const before: string[] = attrs?.textArray || [];
    const after: string[] = cell.textArray || [];
    return (
      attrs?.agentName === (cell.agentName || 'AI') &&
      (attrs?.customText || null) === (cell.customText || null) &&
      attrs?.useWorkflowThinking === (cell.useWorkflowThinking || false) &&
      (before === after ||
        (before.length === after.length && before.every((value, index) => value === after[index])))
    );
  }
  if (isTitle) {
    return (
      (current?.attrs.cover || null) === (cell.metadata?.cover || null) &&
      (current?.attrs.icon || null) === (cell.metadata?.icon || null)
    );
  }
  if (cell.type === 'markdown') {
    // Business metadata is store-owned and absent from Markdown node markup.
    if (cell.metadata?.editorMode === 'source') {
      return (
        parseSourceCellType(current?.attrs.sourceCellType) ===
        parseSourceCellType(cell.metadata.sourceCellType)
      );
    }
    return (current?.attrs.phaseId || null) === (cell.phaseId || null);
  }
  return true;
}

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
  next: readonly ProseMirrorNode[],
  equal = sameProjectedNode
): { start: number; oldEnd: number; newEnd: number } | null {
  let start = 0;
  while (start < current.length && start < next.length && equal(current[start], next[start])) {
    start++;
  }
  if (start === current.length && start === next.length) return null;

  let oldEnd = current.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && equal(current[oldEnd - 1], next[newEnd - 1])) {
    oldEnd--;
    newEnd--;
  }
  return { start, oldEnd, newEnd };
}

/** Linear changed runs for stable order; ID-based LIS anchors for structural edits. */
export function changedBlockRanges(
  current: readonly ProseMirrorNode[],
  next: readonly ProseMirrorNode[]
) {
  if (
    current.length !== next.length ||
    current.some((node, index) => node.attrs.cellId !== next[index].attrs.cellId)
  ) {
    return structuralBlockRanges(current, next);
  }
  const ranges: BlockReplacementRange[] = [];
  let start = -1;
  for (let index = 0; index <= current.length; index++) {
    const changed = index < current.length && !current[index].eq(next[index]);
    if (changed && start < 0) start = index;
    if (!changed && start >= 0) {
      ranges.push({ start, oldEnd: index, newStart: start, newEnd: index });
      start = -1;
    }
  }
  return ranges;
}

/** Shared cell projection for external synchronization and undoable source application. */
export function projectDocumentBlocks(
  editor: Editor,
  cells: Cell[],
  baseline?: readonly Cell[],
  forceParse?: ReadonlySet<string>
) {
  const currentBlocks: ProseMirrorNode[] = [];
  const nextBlocks: ProseMirrorNode[] = [];
  editor.state.doc.forEach((node) => currentBlocks.push(node));
  const nodesById = new Map<string, ProseMirrorNode>();
  for (const node of currentBlocks) nodesById.set(node.attrs.cellId, node);
  const projectedById = new Map<string, Cell>();
  for (const cell of baseline ?? convertEditorStateToCells(editor))
    projectedById.set(cell.id, cell);
  const hasTitle = cells[0]?.type === 'markdown' && /^#(?:\s|$)/.test(cells[0].content.trim());
  let container: HTMLDivElement | undefined;
  const parseBlock = (html: string) => {
    container ??= document.createElement('div');
    container.innerHTML = html;
    return ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(container).content.firstChild!;
  };
  if (!hasTitle) {
    const title = currentBlocks[0];
    if (title?.type.name === 'title' && title.content.size === 0) nextBlocks.push(title);
    else {
      nextBlocks.push(parseBlock(convertCellsToHtml([])));
    }
  }
  cells.forEach((cell, index) => {
    const current = nodesById.get(cell.id);
    const projected = projectedById.get(cell.id);
    const isTitle = index === 0 && hasTitle;
    const storeOwned = cell.type === 'code' || cell.type === 'hybrid';
    const sameContent =
      projected?.type === cell.type && (storeOwned || projected.content === cell.content);
    if (
      current &&
      !forceParse?.has(cell.id) &&
      sameContent &&
      samePresentation(current, cell, isTitle) &&
      (current.type.name === 'markdownSourceCell') === (cell.metadata?.editorMode === 'source') &&
      (current.type.name === 'title') === isTitle
    ) {
      nextBlocks.push(current);
    } else {
      // Parse only changed cells. Unchanged nodes retain their NodeViews and DOM.
      nextBlocks.push(parseBlock(convertCellsToHtml([cell], isTitle)));
    }
  });
  const trailing = currentBlocks[currentBlocks.length - 1];
  const hasTrailingParagraph = trailing?.type.name === 'paragraph' && trailing.content.size === 0;
  if (nextBlocks.length === 1 || hasTrailingParagraph) {
    nextBlocks.push(hasTrailingParagraph ? trailing : editor.schema.nodes.paragraph.create());
  }
  return { currentBlocks, nextBlocks };
}

/** Apply external Cell changes at top-level block boundaries in one transaction. */
export function synchronizeDocument(editor: Editor, cells: Cell[]): boolean {
  if (editor.isDestroyed) return false;
  const { currentBlocks, nextBlocks } = projectDocumentBlocks(editor, cells);

  const range = changedBlockRange(currentBlocks, nextBlocks);
  if (!range) return false;

  let from = 0;
  for (let index = 0; index < range.start; index++) from += currentBlocks[index].nodeSize;
  let to = from;
  for (let index = range.start; index < range.oldEnd; index++) to += currentBlocks[index].nodeSize;
  const anchor = editor.state.selection.$anchor;
  const selectionIndex = anchor.index(0);
  const selectedCellId = currentBlocks[selectionIndex]?.attrs.cellId as string | undefined;
  const selectedBlockStart = anchor.depth ? anchor.before(1) : anchor.pos;
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
    transaction.replaceWith(
      from,
      to,
      Fragment.fromArray(nextBlocks.slice(range.start, range.newEnd))
    );
  }
  if (
    !sameCell &&
    selectedCellId &&
    selectionIndex >= range.start &&
    selectionIndex < range.oldEnd
  ) {
    let targetStart = 0;
    for (const node of nextBlocks) {
      if (node.attrs.cellId === selectedCellId) {
        const position = targetStart + Math.min(selectedOffset, node.nodeSize - 1);
        transaction.setSelection(Selection.near(transaction.doc.resolve(position)));
        break;
      }
      targetStart += node.nodeSize;
    }
  }
  editor.view.dispatch(transaction);
  if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  return true;
}
