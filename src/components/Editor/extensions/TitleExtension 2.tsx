import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TitleNodeView } from './TitleNodeView';

export const TitleExtension = Node.create({
  name: 'title',

  group: 'block',

  content: 'inline*',

  // Ensure it's the first node in the document if we wanted to enforce that,
  // but for now we just treat it as a special block that can exist anywhere
  // (though typically at top).

  addAttributes() {
    return {
      cover: {
        default: null,
      },
      icon: {
        default: null,
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
        renderHTML: (attributes) => (attributes.id ? { id: attributes.id } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'h1',
        getAttrs: (node) => ({
          id: (node as HTMLElement).getAttribute('id'),
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
      'Mod-Alt-1': () => this.editor.commands.setNode('title'),
    };
  },
});
