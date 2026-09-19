import type { EditorState } from '@tiptap/pm/state';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import { v4 as uuidv4 } from 'uuid';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';

export const fenceInputPattern = /^```([\w+-]*)[ \t]*$/;

/** Commit a completed fence gesture without replacing neighboring Markdown blocks. */
export function commitFenceInput(state: EditorState, from: number, to: number, text: string): boolean {
  const match = fenceInputPattern.exec(text);
  const $pos = state.doc.resolve(from);
  if (!match || $pos.parent.type.name !== 'paragraph' || from !== $pos.start() || to !== $pos.end()) return false;
  const language = normalizeCodeLanguage(match[1]);
  const owner = $pos.depth > 1 ? $pos.node(1) : null;
  const singleCell = owner?.type.name === 'markdownCell' && owner.childCount === 1 && $pos.depth === 2;
  const executable = language !== 'mermaid' && ($pos.depth === 1 || singleCell);
  const cellId = singleCell ? owner.attrs.cellId || uuidv4() : uuidv4();
  const start = executable && singleCell ? $pos.before(1) : $pos.before();
  const end = executable && singleCell ? $pos.after(1) : $pos.after();
  const node = language === 'mermaid'
    ? state.schema.nodes.mermaidBlock.create({ code: '', source: '' })
    : executable
      ? state.schema.nodes.executableCodeBlock.create({ language, code: '', cellId, outputs: [], enableEdit: true })
      : state.schema.nodes.fencedCodeBlock.create({ language });
  const boundary = state.doc.resolve(start);
  const index = boundary.index();
  let replacement = Fragment.from(node);
  let nodeStart = start;
  if (!boundary.parent.canReplace(index, index + 1, replacement)) {
    // listItem requires a leading paragraph. Supply it explicitly rather than
    // relying on replaceWith's fitting, which changes the inserted node offset.
    const paragraph = state.schema.nodes.paragraph.create();
    replacement = Fragment.fromArray([paragraph, node]);
    if (!boundary.parent.canReplace(index, index + 1, replacement)) return false;
    nodeStart += paragraph.nodeSize;
  }
  const tr = state.tr.replaceWith(start, end, replacement);
  tr.setSelection(node.isAtom
    ? NodeSelection.create(tr.doc, nodeStart)
    : TextSelection.create(tr.doc, nodeStart + 1));
  if (executable) {
    tr.setMeta('codeBlockInputRule', true);
    tr.setMeta('newCodeCellId', cellId);
    tr.setMeta('codeBlockLanguage', language);
  }
  return true;
}
