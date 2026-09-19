import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import type { Cell } from '@Store/models';
import { getCellById } from '@Store/models/cellIndex';
import { NotebookSourceStep } from './NotebookSourceStep';
import { changedBlockRanges, projectDocumentBlocks } from './documentSync';

/** One undoable document replacement, with store-owned content captured only for changed cells. */
export function applyNotebookSource(editor: Editor, before: Cell[], after: Cell[]): void {
  if (editor.isDestroyed || !editor.isEditable) throw new Error('Editor is not editable');
  if (before.length === after.length && before.every((cell, index) => cell === after[index])) return;
  const changedBefore = before.filter((cell) => getCellById(after, cell.id) !== cell);
  const changedAfter = after.filter((cell) => getCellById(before, cell.id) !== cell);
  const { currentBlocks, nextBlocks } = projectDocumentBlocks(
    editor,
    after,
    before,
    new Set(changedAfter.map((cell) => cell.id))
  );
  const ranges = changedBlockRanges(currentBlocks, nextBlocks);
  const transaction = closeHistory(editor.state.tr);
  let cursor = currentBlocks.length;
  let offset = editor.state.doc.content.size;
  // Right-to-left replacement keeps original positions valid for every earlier range.
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index];
    while (cursor > range.oldEnd) offset -= currentBlocks[--cursor].nodeSize;
    const to = offset;
    while (cursor > range.start) offset -= currentBlocks[--cursor].nodeSize;
    transaction.replaceWith(
      offset,
      to,
      Fragment.fromArray(nextBlocks.slice(range.newStart, range.newEnd))
    );
  }
  transaction.step(new NotebookSourceStep(changedBefore, changedAfter));
  editor.view.dispatch(transaction);
  editor.view.dispatch(closeHistory(editor.state.tr));
}
