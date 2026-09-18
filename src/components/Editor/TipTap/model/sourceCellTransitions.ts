import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { Cell } from '@Store/models';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { EXTERNAL_CELL_SYNC } from './documentSync';
import { DOMParser } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import {
  convertCellsToHtml,
  convertEditorStateToCells,
  serializeMarkdownBlock,
} from '../../utils/cellConverters';
import { formatCodeFence, standaloneFence } from '../../utils/fencedMarkdown';

/** Convert only the owning cell; unrelated cells are neither projected nor replaced. */
export function breakNestedCodeFence(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  if (
    !editor.isEditable ||
    !empty ||
    $from.parentOffset !== 0 ||
    $from.parent.type.name !== 'fencedCodeBlock' ||
    $from.depth !== 2 ||
    $from.node(1).type.name !== 'markdownCell'
  )
    return false;
  const cell = $from.node(1);
  const selectedIndex = $from.index(1);
  const parts: string[] = [];
  let offset = 0;
  let caret = 0;
  cell.forEach((child, _position, index) => {
    let source = serializeMarkdownBlock(child.toJSON());
    if (index === selectedIndex) {
      const fence = standaloneFence(source)!;
      const deletion = fence.indent.length + fence.length - 1;
      source = source.slice(0, deletion) + source.slice(deletion + 1);
      caret = offset + deletion;
    }
    parts.push(source);
    offset += source.length + 2;
  });
  const pos = $from.before(1);
  const replacement = editor.schema.nodes.markdownSourceCell.create({
    cellId: cell.attrs.cellId,
    source: parts.join('\n\n'),
    caret,
  });
  const tr = closeHistory(editor.state.tr).replaceWith(pos, pos + cell.nodeSize, replacement);
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.focus();
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

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
  const source = formatCodeFence(cell.content, language).slice(1);
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
  const fence = standaloneFence(source);
  let replacement;
  if (fence && fence.language !== 'mermaid') {
    replacement = editor.schema.nodes.executableCodeBlock.create({
      cellId: node.attrs.cellId,
      language: normalizeCodeLanguage(fence.language),
      code: encodeURIComponent(fence.code),
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
