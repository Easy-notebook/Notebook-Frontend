import { Node, mergeAttributes } from '@tiptap/core';

/** A persistent notebook cell boundary around editable Markdown blocks. */
export const MarkdownCellExtension = Node.create({
  name: 'markdownCell',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      phaseId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-phase-id'),
        renderHTML: ({ phaseId }) => (phaseId ? { 'data-phase-id': phaseId } : {}),
      },
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-id'),
        renderHTML: ({ cellId }) => (cellId ? { 'data-cell-id': cellId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="markdown-cell"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'markdown-cell' }), 0];
  },
});
