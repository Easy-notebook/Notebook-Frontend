import type { Editor } from '@tiptap/react';
import { DOMParser as ProseMirrorDOMParser, Fragment } from 'prosemirror-model';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Cell } from '@Store/models';
import { convertCellsToHtml, convertEditorStateToCells } from '@Editor/utils/cellConverters';
import { AllSelection, NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { StepMap } from '@tiptap/pm/transform';
import { parseSourceCellType } from '../../utils/sourceCellAttributes';
import { structuralBlockRanges, type BlockReplacementRange } from './structuralBlockRanges';
import { projectHeadingIdentities } from './headingProjection';

export const EXTERNAL_CELL_SYNC = 'externalCellSync';

/** Relative node positions for a same-markup content replacement. */
function blockContentChange(before: ProseMirrorNode, after: ProseMirrorNode) {
  if (!before.sameMarkup(after) || before.isLeaf) return undefined;
  const start = before.content.findDiffStart(after.content);
  const end = before.content.findDiffEnd(after.content);
  if (start === null || end === null) return undefined;
  const overlap = Math.max(0, start - Math.min(end.a, end.b));
  return { from: start + 1, to: end.a + overlap + 1, newTo: end.b + overlap + 1 };
}

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
    // Phase metadata and heading anchors are projected without reparsing content.
    return true;
  }
  return true;
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
  const headingCounters = new Map<string, Map<string, number>>();
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
      nextBlocks.push(projectHeadingIdentities(current, cell, headingCounters));
    } else {
      // Parse only changed cells. Unchanged nodes retain their NodeViews and DOM.
      nextBlocks.push(
        projectHeadingIdentities(
          parseBlock(convertCellsToHtml([cell], isTitle)),
          cell,
          headingCounters
        )
      );
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

  const ranges = changedBlockRanges(currentBlocks, nextBlocks);
  if (!ranges.length) return false;
  const offsets = [0];
  for (const block of currentBlocks) offsets.push(offsets[offsets.length - 1] + block.nodeSize);
  const selection = editor.state.selection;
  // Whole-document selection maps itself to the new document; it has no cell owner.
  const endpoints = (
    selection instanceof AllSelection
      ? []
      : selection instanceof TextSelection
        ? [selection.$anchor, selection.$head]
        : [selection.$anchor]
  ).map((point) => ({
    position: point.pos,
    index: point.index(0),
    cellId: currentBlocks[point.index(0)]?.attrs.cellId as string | undefined,
    offset: point.pos - (point.depth ? point.before(1) : point.pos),
    relocate: false,
  }));
  const scroller = editor.view.dom.closest('.tiptap-editor') as HTMLElement | null;
  const scrollTop = scroller?.scrollTop;
  const transaction = editor.state.tr
    .setMeta(EXTERNAL_CELL_SYNC, true)
    .setMeta('addToHistory', false);
  // Reverse order keeps original offsets valid without remapping every range.
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index];
    const from = offsets[range.start];
    const to = offsets[range.oldEnd];
    const oldBlock = currentBlocks[range.start];
    const newBlock = nextBlocks[range.newStart];
    const sameCell =
      range.oldEnd === range.start + 1 &&
      range.newEnd === range.newStart + 1 &&
      oldBlock.sameMarkup(newBlock) &&
      !oldBlock.isLeaf;
    if (sameCell) {
      // Preserve text selection mapping inside each changed cell, not just its ID.
      const change = blockContentChange(oldBlock, newBlock);
      if (!change) continue;
      transaction.replace(
        from + change.from,
        from + change.to,
        newBlock.slice(change.from - 1, change.newTo - 1)
      );
    } else {
      transaction.replaceWith(
        from,
        to,
        Fragment.fromArray(nextBlocks.slice(range.newStart, range.newEnd))
      );
      for (const endpoint of endpoints)
        if (endpoint.index >= range.start && endpoint.index < range.oldEnd)
          endpoint.relocate = true;
    }
  }
  if (endpoints.some((endpoint) => endpoint.relocate && endpoint.cellId)) {
    const positions = endpoints.map((endpoint) => transaction.mapping.map(endpoint.position));
    let targetStart = 0;
    for (const node of nextBlocks) {
      for (let index = 0; index < endpoints.length; index++) {
        const endpoint = endpoints[index];
        if (endpoint.relocate && endpoint.cellId && node.attrs.cellId === endpoint.cellId) {
          const change = blockContentChange(currentBlocks[endpoint.index], node);
          const offset = change
            ? new StepMap([change.from, change.to - change.from, change.newTo - change.from]).map(
                endpoint.offset
              )
            : endpoint.offset;
          positions[index] = targetStart + Math.min(offset, node.nodeSize - 1);
        }
      }
      targetStart += node.nodeSize;
    }
    const selectedNode = transaction.doc.nodeAt(positions[0]);
    const retainsNodeSelection =
      selection instanceof NodeSelection &&
      endpoints[0].cellId &&
      selectedNode?.attrs.cellId === endpoints[0].cellId &&
      NodeSelection.isSelectable(selectedNode);
    transaction.setSelection(
      selection instanceof TextSelection
        ? TextSelection.between(
            transaction.doc.resolve(positions[0]),
            transaction.doc.resolve(positions[1])
          )
        : retainsNodeSelection
          ? NodeSelection.create(transaction.doc, positions[0])
          : Selection.near(transaction.doc.resolve(positions[0]))
    );
  }
  editor.view.dispatch(transaction);
  if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  return true;
}
