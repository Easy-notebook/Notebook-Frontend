import { Extension } from '@tiptap/core';
import { DOMParser, type ResolvedPos } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { addRowAfter, deleteRow } from '@tiptap/pm/tables';
import { renderNotebookMarkdown } from '../utils/notebookMarkdownParser';
import { isCompositionInput } from '../utils/compositionInput';

export const tableInputPluginKey = new PluginKey('simpleTableParser');
const columnAlignment = (value: string | null) =>
  value && /^(left|center|right)$/.test(value) ? value : null;

/** Count unescaped separators without discarding empty columns. */
function headerWidth(source: string): number {
  const line = source.trim();
  let separators = 0;
  let escaped = false;
  let endsWithSeparator = false;
  for (const character of line) {
    endsWithSeparator = character === '|' && !escaped;
    if (endsWithSeparator) separators++;
    escaped = character === '\\' && !escaped;
  }
  if (!separators) return 0;
  return separators + 1 - Number(line.startsWith('|')) - Number(endsWithSeparator);
}

function ancestorDepth($pos: ResolvedPos, name: string): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === name) return depth;
  }
  return -1;
}

/** One constructor for Enter and typed separator lines; the Markdown parser owns cell syntax. */
function replaceWithTable(
  tr: Transaction,
  header: string,
  separator: string,
  from: number,
  to: number
) {
  const width = headerWidth(header);
  if (width < 2) return null;
  const element = document.createElement('div');
  element.innerHTML = renderNotebookMarkdown(
    `${header}\n${separator}\n| ${Array(width).fill('').join(' | ')} |`,
    null,
    null
  );
  const fragment = DOMParser.fromSchema(tr.doc.type.schema).parseSlice(element).content;
  const table = fragment.firstChild;
  if (fragment.childCount !== 1 || table?.type.name !== 'table') return null;
  const $from = tr.doc.resolve(from);
  const $to = tr.doc.resolve(to);
  if (
    !$from.sameParent($to) ||
    !$from.parent.canReplaceWith($from.index(), $to.index(), table.type)
  )
    return null;
  tr.replaceWith(from, to, table);
  tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1 + table.firstChild!.nodeSize + 2)));
  return tr.scrollIntoView();
}

/** Only the edited paragraph and its immediate sibling are inspected; no timers or document scan. */
export function tableInputTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string
): Transaction | null {
  if (text !== '|' && text !== '-') return null;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if (
    !$from.sameParent($to) ||
    $from.parent.type.name !== 'paragraph' ||
    ancestorDepth($from, 'table') >= 0
  )
    return null;
  if ($to.parentOffset !== $to.parent.content.size || $from.depth < 2) return null;
  const parent = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (index === 0) return null;
  const previous = parent.child(index - 1);
  if (previous.type.name !== 'paragraph') return null;
  const header = previous.textContent.trim();
  if (headerWidth(header) < 2) return null;
  const separator = ($from.parent.textBetween(0, $from.parentOffset, '', '\uFFFC') + text).trim();
  if (!/^[\s:|-]+$/.test(separator) || !separator.includes('-')) return null;
  const candidate = state.tr.insertText(text, from, to);
  const paragraphStart = $from.before();
  const paragraph = candidate.doc.nodeAt(paragraphStart)!;
  return replaceWithTable(
    candidate,
    header,
    separator,
    paragraphStart - previous.nodeSize,
    paragraphStart + paragraph.nodeSize
  );
}

export const SimpleTableExtension = Extension.create({
  name: 'simpleTable',
  addGlobalAttributes() {
    return [
      {
        types: ['tableHeader', 'tableCell'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) =>
              columnAlignment(element.style.textAlign || element.getAttribute('align')),
            renderHTML: (attributes) => {
              const alignment = columnAlignment(attributes.textAlign);
              return alignment ? { style: `text-align: ${alignment}` } : {};
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: tableInputPluginKey,
        props: {
          handleTextInput(view, from, to, text) {
            if (!editor.isEditable || view.composing) return false;
            const tr = tableInputTransaction(view.state, from, to, text);
            if (!tr) return false;
            view.dispatch(tr);
            return true;
          },
          handleKeyDown(view, event) {
            if (
              !editor.isEditable ||
              view.composing ||
              isCompositionInput(event) ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey
            )
              return false;
            const { state } = view;
            const { $from, empty } = state.selection;
            const tableDepth = ancestorDepth($from, 'table');
            if (tableDepth < 0) {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                !empty ||
                $from.parent.type.name !== 'paragraph' ||
                $from.parentOffset !== $from.parent.content.size
              )
                return false;
              const header = $from.parent.textContent.trim();
              const width = headerWidth(header);
              if (width < 2) return false;
              const tr = replaceWithTable(
                state.tr,
                header,
                `| ${Array(width).fill('---').join(' | ')} |`,
                $from.before(),
                $from.after()
              );
              if (!tr) return false;
              view.dispatch(tr);
              event.preventDefault();
              return true;
            }
            if (!event.shiftKey) return false;
            if (event.key === 'Enter') {
              const rowDepth = ancestorDepth($from, 'tableRow');
              if (rowDepth < 0) return false;
              const insertion = $from.after(rowDepth);
              const handled = addRowAfter(state, (tr) => {
                tr.setSelection(TextSelection.near(tr.doc.resolve(insertion + 3)));
                view.dispatch(tr.scrollIntoView());
              });
              if (handled) event.preventDefault();
              return handled;
            }
            if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
            const table = $from.node(tableDepth);
            if (ancestorDepth($from, 'tableHeader') >= 0 || table.childCount === 1) {
              const pos = $from.before(tableDepth);
              const tr = state.tr.replaceWith(
                pos,
                $from.after(tableDepth),
                state.schema.nodes.paragraph.create()
              );
              tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
              view.dispatch(tr.scrollIntoView());
              event.preventDefault();
              return true;
            }
            const handled = deleteRow(state, (tr) => view.dispatch(tr.scrollIntoView()));
            if (handled) event.preventDefault();
            return handled;
          },
        },
      }),
    ];
  },
});

export default SimpleTableExtension;
