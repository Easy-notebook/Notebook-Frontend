import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { Cell } from '@Store/models';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { EXTERNAL_CELL_SYNC } from './documentSync';
import { DOMParser } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { convertCellsToHtml, convertEditorStateToCells } from '../../utils/cellConverters';

export function breakCodeBlockFence(editor: Editor, pos: number, cell: Cell): boolean {
  const current = editor.state.doc.nodeAt(pos);
  if (!editor.isEditable || current?.type.name !== 'executableCodeBlock') return false;
  const language = normalizeCodeLanguage(cell.language);
  // Refresh the store-backed content before capturing the undo boundary.
  editor.view.dispatch(
    editor.state.tr
      .setNodeMarkup(pos, undefined, {
        ...current.attrs,
        code: encodeURIComponent(cell.content),
        language,
        outputs: encodeURIComponent(JSON.stringify(cell.outputs || [])),
        originalType: cell.type,
      })
      .setMeta('addToHistory', false)
      .setMeta(EXTERNAL_CELL_SYNC, true)
  );
  const source = `\`\`${language}\n${cell.content}\n\`\`\``;
  const replacement = editor.schema.nodes.markdownSourceCell.create({
    cellId: cell.id,
    source,
    caret: 2,
  });
  const tr = closeHistory(editor.state.tr).replaceWith(pos, pos + current.nodeSize, replacement);
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.focus();
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function previewMarkdownSource(editor: Editor, pos: number): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!editor.isEditable || node?.type.name !== 'markdownSourceCell') return false;
  const source = node.attrs.source as string;
  const fence = source.match(/^```([\w+-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  let replacement;
  if (fence && fence[1].toLowerCase() !== 'mermaid') {
    replacement = editor.schema.nodes.executableCodeBlock.create({
      cellId: node.attrs.cellId,
      language: normalizeCodeLanguage(fence[1]),
      code: encodeURIComponent(fence[2]),
      outputs: encodeURIComponent('[]'),
      originalType: 'code',
    });
  } else {
    const container = document.createElement('div');
    container.innerHTML = convertCellsToHtml(
      [
        {
          id: node.attrs.cellId,
          type: 'markdown',
          content: source,
          outputs: [],
        },
      ],
      false
    );
    replacement = DOMParser.fromSchema(editor.schema).parseSlice(container).content;
  }
  const tr = closeHistory(editor.state.tr).replaceWith(pos, pos + node.nodeSize, replacement);
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export function editSelectedCellSource(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  const pos = $from.depth ? $from.before(1) : $from.pos;
  const node = editor.state.doc.nodeAt(pos);
  if (!editor.isEditable || node?.type.name !== 'markdownCell') return false;
  const cell = convertEditorStateToCells(editor).find((cell) => cell.id === node.attrs.cellId);
  if (!cell) return false;
  const replacement = editor.schema.nodes.markdownSourceCell.create({
    cellId: cell.id,
    source: cell.content,
  });
  const tr = closeHistory(editor.state.tr).replaceWith(pos, pos + node.nodeSize, replacement);
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.focus();
  editor.view.dispatch(tr);
  return true;
}
