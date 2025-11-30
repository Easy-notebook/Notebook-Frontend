import { BaseExtension } from '../../core/BaseExtension';
import { ImageView } from './ImageView';
import { mergeAttributes, InputRule } from '@tiptap/core';

export const ImageExtension = BaseExtension.create({
  name: 'markdownImage',
  component: ImageView,
}).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      markdown: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => ({
          src: element.getAttribute('src'),
          alt: element.getAttribute('alt'),
          title: element.getAttribute('title'),
          markdown: `![${element.getAttribute('alt') || ''}](${element.getAttribute('src') || ''})`,
        }),
      },
      {
        tag: 'div[data-type="markdown-image"]',
        getAttrs: (element) => ({
          src: element.getAttribute('data-src'),
          alt: element.getAttribute('data-alt'),
          title: element.getAttribute('data-title'),
          markdown: element.getAttribute('data-markdown'),
          cellId: element.getAttribute('data-cell-id'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        { 'data-type': 'markdown-image' },
        {
          'data-src': HTMLAttributes.src,
          'data-alt': HTMLAttributes.alt,
          'data-title': HTMLAttributes.title,
          'data-markdown': HTMLAttributes.markdown,
          'data-cell-id': HTMLAttributes.cellId,
        }
      ),
    ];
  },

  addCommands() {
    return {
      setImage:
        (options: any) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /!\[([^\]]*)\]\(([^)]+)\)$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const start = range.from;
          const end = range.to;

          const alt = match[1] || '';
          const src = match[2] || '';
          const markdown = match[0];

          tr.replaceWith(
            start,
            end,
            this.type.create({
              src,
              alt,
              title: alt,
              markdown,
            })
          );
        },
      }),
    ];
  },
});
