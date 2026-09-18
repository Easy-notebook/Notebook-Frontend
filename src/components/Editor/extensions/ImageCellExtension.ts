import { Node, mergeAttributes } from '@tiptap/core';

/** Block boundary for a store-backed image cell with an inline image node inside. */
export const ImageCellExtension = Node.create({
  name: 'imageCell',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-id'),
        renderHTML: ({ cellId }) => (cellId ? { 'data-cell-id': cellId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-cell"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-cell' }), 0];
  },
});
