import { BaseExtension } from '../../core/BaseExtension';
import { LaTeXView } from './LaTeXView';
import { mergeAttributes, InputRule } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

// Helper functions for LaTeX conversion
function checkAndConvertLatex(view: any, nodeType: any) {
  const { state } = view;
  const { doc, selection } = state;
  const { from } = selection;

  const $from = doc.resolve(from);
  const paragraph = $from.parent;

  if (paragraph.type.name !== 'paragraph') {
    return;
  }

  const paragraphStart = $from.start($from.depth);
  const paragraphText = paragraph.textContent;

  const blockLatexMatch = paragraphText.trim().match(/^(\$\$[^$]+\$\$|\$[^$]+\$)$/);
  if (blockLatexMatch) {
    const fullMatch = blockLatexMatch[1];
    let latex, displayMode;

    if (fullMatch.startsWith('$$') && fullMatch.endsWith('$$')) {
      latex = fullMatch.slice(2, -2).trim();
      displayMode = true;
    } else if (fullMatch.startsWith('$') && fullMatch.endsWith('$')) {
      latex = fullMatch.slice(1, -1).trim();
      displayMode = true;
    }

    if (latex) {
      const tr = state.tr;
      const latexNode = nodeType.create({
        latex: latex,
        displayMode: displayMode,
      });

      tr.replaceWith(paragraphStart, paragraphStart + paragraph.nodeSize, latexNode);
      view.dispatch(tr);
      return;
    }
  }

  convertInlineLatex(view, nodeType, paragraph, paragraphStart, paragraphText);
}

function convertInlineLatex(
  view: any,
  nodeType: any,
  paragraph: any,
  paragraphStart: number,
  paragraphText: string
) {
  const { state } = view;
  const latexMatches = [];

  let match;
  const blockRegex = /\$\$([^$]+)\$\$/g;
  while ((match = blockRegex.exec(paragraphText)) !== null) {
    latexMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      latex: match[1].trim(),
      displayMode: false,
      original: match[0],
    });
  }

  const inlineRegex = /\$([^$]+)\$/g;
  while ((match = inlineRegex.exec(paragraphText)) !== null) {
    const overlaps = latexMatches.some(
      (existing) => match!.index < existing.end && match!.index + match![0].length > existing.start
    );

    const prevChar = match.index > 0 ? paragraphText[match.index - 1] : '';
    const nextChar =
      match.index + match[0].length < paragraphText.length
        ? paragraphText[match.index + match[0].length]
        : '';

    const isPartOfDoubleD = prevChar === '$' || nextChar === '$';

    if (!overlaps && !isPartOfDoubleD) {
      latexMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        latex: match[1].trim(),
        displayMode: false,
        original: match[0],
      });
    }
  }

  if (latexMatches.length === 0) {
    return;
  }

  latexMatches.sort((a, b) => b.start - a.start);

  const tr = state.tr;

  for (const latexMatch of latexMatches) {
    const latexNode = nodeType.create({
      latex: latexMatch.latex,
      displayMode: latexMatch.displayMode,
    });

    const start = paragraphStart + 1 + latexMatch.start;
    const end = paragraphStart + 1 + latexMatch.end;

    tr.replaceWith(start, end, latexNode);
  }

  if (latexMatches.length > 0) {
    view.dispatch(tr);
  }
}

export const LaTeXExtension = BaseExtension.create({
  name: 'latexBlock',
  component: LaTeXView,
}).extend({
  group: 'inline',
  inline: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      latex: { default: '' },
      displayMode: { default: true },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="latex-block"]',
        getAttrs: (element) => ({
          latex: element.getAttribute('data-latex'),
          displayMode: element.getAttribute('data-display-mode') === 'true',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-type': 'latex-block' },
        {
          'data-latex': HTMLAttributes.latex,
          'data-display-mode': HTMLAttributes.displayMode,
        }
      ),
    ];
  },

  addCommands() {
    return {
      setLaTeX:
        (options: any) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('latexPaste'),
        props: {
          handlePaste: (view, event, slice) => {
            const text = event.clipboardData?.getData('text/plain') || '';

            if (text && (text.includes('$$') || text.includes('$'))) {
              const blockMatch = text.match(/\$\$([^$]+)\$\$/);
              if (blockMatch) {
                event.preventDefault();
                const { state } = view;
                const { tr } = state;
                const { from, to } = tr.selection;

                if (from !== to) {
                  tr.delete(from, to);
                }

                const latexNode = this.type.create({
                  latex: blockMatch[1].trim(),
                  displayMode: true,
                });
                tr.insert(from, latexNode);
                view.dispatch(tr);
                return true;
              }

              const inlineMatch = text.match(/\$([^$]+)\$/);
              if (inlineMatch) {
                event.preventDefault();
                const { state } = view;
                const { tr } = state;
                const { from, to } = tr.selection;

                if (from !== to) {
                  tr.delete(from, to);
                }

                const latexNode = this.type.create({
                  latex: inlineMatch[1].trim(),
                  displayMode: false,
                });
                tr.insert(from, latexNode);
                view.dispatch(tr);
                return true;
              }
            }

            return false;
          },
        },
      }),

      new Plugin({
        key: new PluginKey('latexRealtime'),
        props: {
          handleTextInput: (view, from, to, text) => {
            if (text === '$') {
              setTimeout(() => {
                checkAndConvertLatex(view, this.type);
              }, 50);
            }
            return false;
          },

          handleKeyDown: (view, event) => {
            if (event.key === ' ' || event.key === 'Enter' || event.key === 'Tab') {
              setTimeout(() => {
                checkAndConvertLatex(view, this.type);
              }, 50);
            }
            return false;
          },
        },
      }),
    ];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^$]+)\$\$ $/,
        handler: ({ state, range, match, chain }) => {
          const start = range.from;
          const end = range.to - 1;
          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: true,
          });
          chain()
            .command(({ tr }) => {
              tr.replaceWith(start, end, latexNode);
              return true;
            })
            .run();
        },
      }),
      new InputRule({
        find: /^\$([^$]+)\$ $/,
        handler: ({ state, range, match, chain }) => {
          const start = range.from;
          const end = range.to - 1;
          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: true,
          });
          chain()
            .command(({ tr }) => {
              tr.replaceWith(start, end, latexNode);
              return true;
            })
            .run();
        },
      }),
      new InputRule({
        find: /\$([^$]+)\$ $/,
        handler: ({ state, range, match, chain }) => {
          const { doc } = state;
          const start = range.from;
          const end = range.to - 1;
          const $start = doc.resolve(start);
          const isAtLineStart = $start.parentOffset === 0;

          if (isAtLineStart) {
            return null;
          }

          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: false,
          });
          chain()
            .command(({ tr }) => {
              tr.replaceWith(start, end, latexNode);
              return true;
            })
            .run();
        },
      }),
      new InputRule({
        find: /\$\$([^$]+)\$\$ $/,
        handler: ({ state, range, match, chain }) => {
          const { doc } = state;
          const start = range.from;
          const end = range.to - 1;
          const $start = doc.resolve(start);
          const isAtLineStart = $start.parentOffset === 0;

          if (isAtLineStart) {
            return null;
          }

          const latexNode = this.type.create({
            latex: match[1].trim(),
            displayMode: false,
          });
          chain()
            .command(({ tr }) => {
              tr.replaceWith(start, end, latexNode);
              return true;
            })
            .run();
        },
      }),
    ];
  },
});
