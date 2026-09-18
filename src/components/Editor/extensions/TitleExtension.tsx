import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TitleNodeView } from './TitleNodeView';
import { TextSelection } from '@tiptap/pm/state';
import { generateCellId } from '../utils/cellConverters';

export const TitleExtension = Node.create({
  name: 'title',
  content: 'inline*',

  addAttributes() {
    return {
      cover: {
        default: null,
      },
      icon: {
        default: null,
      },
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-id') || element.getAttribute('id'),
        renderHTML: (attributes) =>
          attributes.cellId ? { 'data-cell-id': attributes.cellId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="title"]',
        getAttrs: (node) => ({
          cellId: (node as HTMLElement).getAttribute('data-cell-id'),
          cover: (node as HTMLElement).getAttribute('data-cover'),
          icon: (node as HTMLElement).getAttribute('data-icon'),
        }),
      },
      {
        tag: 'h1',
        getAttrs: (node) => ({
          cellId:
            (node as HTMLElement).getAttribute('data-cell-id') ||
            (node as HTMLElement).getAttribute('id'),
          cover: (node as HTMLElement).getAttribute('data-cover'),
          icon: (node as HTMLElement).getAttribute('data-icon'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'h1',
      mergeAttributes(HTMLAttributes, {
        'data-cover': HTMLAttributes.cover,
        'data-icon': HTMLAttributes.icon,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TitleNodeView);
  },

  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.commands.command(({ tr, state, dispatch }) => {
          const { $from, $to } = tr.selection;
          if ($from.parent.type !== this.type || $to.parent.type !== this.type) return false;
          if (!dispatch) return true;
          const tail = $to.parent.content.cut($to.parentOffset);
          const end = $from.end();
          tr.delete($from.pos, end);
          const insertAt = tr.doc.firstChild!.nodeSize;
          const cell = state.schema.nodes.markdownCell.create(
            { cellId: generateCellId() },
            state.schema.nodes.paragraph.create(null, tail)
          );
          // Replace the schema's empty trailing paragraph, rather than leaving a ghost row.
          const next = tr.doc.childCount > 1 ? tr.doc.child(1) : null;
          const replaceEnd =
            next?.type.name === 'paragraph' && next.content.size === 0
              ? insertAt + next.nodeSize
              : insertAt;
          tr.replaceWith(insertAt, replaceEnd, cell);
          tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));
          tr.scrollIntoView();
          return true;
        }),
      'Mod-Alt-1': () => this.editor.commands.setNode('title'),
    };
  },
});
