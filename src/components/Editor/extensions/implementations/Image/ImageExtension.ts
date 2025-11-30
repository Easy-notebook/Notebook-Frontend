import { BaseExtension } from '../../core/BaseExtension';
import { ImageView } from './ImageView';
import { mergeAttributes, InputRule } from '@tiptap/core';
import { generateCellId } from '../../../utils/cellConverters';

export const ImageExtension = BaseExtension.create({
  name: 'markdownImage',
  component: ImageView,
}).extend({
  group: 'inline',
  inline: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      markdown: { default: null },
      displayMode: { default: true }, // Default to block if not specified
      cellId: { default: null },
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
          displayMode: element.getAttribute('data-display-mode') !== 'false',
          cellId: element.getAttribute('data-cell-id'),
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
          displayMode: element.getAttribute('data-display-mode') !== 'false',
        }),
      },
      {
        tag: 'span[data-type="markdown-image"]',
        getAttrs: (element) => ({
          src: element.getAttribute('data-src'),
          alt: element.getAttribute('data-alt'),
          title: element.getAttribute('data-title'),
          markdown: element.getAttribute('data-markdown'),
          cellId: element.getAttribute('data-cell-id'),
          displayMode: element.getAttribute('data-display-mode') !== 'false',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const tag = HTMLAttributes.displayMode ? 'div' : 'span';
    return [
      tag,
      mergeAttributes(
        { 'data-type': 'markdown-image' },
        {
          'data-src': HTMLAttributes.src,
          'data-alt': HTMLAttributes.alt,
          'data-title': HTMLAttributes.title,
          'data-markdown': HTMLAttributes.markdown,
          'data-cell-id': HTMLAttributes.cellId,
          'data-display-mode': String(HTMLAttributes.displayMode),
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
      // Block image: Start of line
      new InputRule({
        find: /^!\[([^\]]*)\]\(([^)]+)\)$/,
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
              displayMode: true, // Block
              cellId: generateCellId(),
            })
          );
        },
      }),
      // Inline image: Not start of line
      new InputRule({
        find: /!\[([^\]]*)\]\(([^)]+)\)$/,
        handler: ({ state, range, match }) => {
          const { tr, doc } = state;
          const start = range.from;
          const end = range.to;

          // Check if at start of line (to avoid conflict with block rule if regex overlaps)
          const $start = doc.resolve(start);
          const isAtLineStart = $start.parentOffset === 0;

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
              displayMode: isAtLineStart, // If it somehow matched at start, treat as block
              cellId: generateCellId(),
            })
          );
        },
      }),
    ];
  },
});
