import { BaseExtension } from '../../core/BaseExtension';
import { CodeBlockView } from './CodeBlockView';
import { v4 as uuidv4 } from 'uuid';
import { TextSelection } from 'prosemirror-state';

export const CodeBlockExtension = BaseExtension.create({
  name: 'executableCodeBlock',
  component: CodeBlockView,
}).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: 'python',
        parseHTML: (element) => element.getAttribute('data-language') || 'python',
        renderHTML: (attributes) => ({
          'data-language': attributes.language,
        }),
      },
      code: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-code') || '',
        renderHTML: (attributes) => ({
          'data-code': attributes.code,
        }),
      },
      outputs: {
        default: [],
        parseHTML: (element) => {
          const outputsAttr = element.getAttribute('data-outputs');
          if (!outputsAttr) return [];
          try {
            return JSON.parse(decodeURIComponent(outputsAttr));
          } catch {
            try {
              return JSON.parse(outputsAttr);
            } catch {
              return [];
            }
          }
        },
        renderHTML: (attributes) => ({
          'data-outputs': encodeURIComponent(JSON.stringify(attributes.outputs || [])),
        }),
      },
      enableEdit: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-enable-edit') !== 'false',
        renderHTML: (attributes) => ({
          'data-enable-edit': String(attributes.enableEdit),
        }),
      },
      isGenerating: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-is-generating') === 'true',
        renderHTML: (attributes) => ({
          'data-is-generating': String(!!attributes.isGenerating),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="executable-code-block"]',
      },
      {
        tag: 'pre',
        preserveWhitespace: 'full',
      },
    ];
  },

  addCommands() {
    return {
      setExecutableCodeBlock:
        (attributes: Record<string, unknown>) =>
        ({
          commands,
        }: {
          commands: { setNode: (name: string, attrs: Record<string, unknown>) => boolean };
        }) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4();
          }
          return commands.setNode(this.name, attributes);
        },
      insertExecutableCodeBlock:
        (attributes: Record<string, unknown>) =>
        ({
          commands,
        }: {
          commands: {
            insertContent: (content: { type: string; attrs: Record<string, unknown> }) => boolean;
          };
        }) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4();
          }
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;

        // If cursor is at the start of the document or block
        if ($from.parentOffset === 0) {
          const index = $from.index($from.depth - 1);
          const parent = $from.node($from.depth - 1);

          if (index > 0) {
            const prevNode = parent.child(index - 1);
            if (prevNode && prevNode.type.name === this.name) {
              const cellId = prevNode.attrs.cellId;
              if (cellId) {
                // Dispatch navigation event to focus the code block at the end
                window.dispatchEvent(
                  new CustomEvent('cell-navigation', {
                    detail: { targetCellId: cellId, direction: 'up' },
                  })
                );
                return true; // Prevent default behavior (selecting the node)
              }
            }
          }
        }
        return false;
      },
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;

        if ($from.parentOffset === 0) {
          const index = $from.index($from.depth - 1);
          const parent = $from.node($from.depth - 1);

          if (index > 0) {
            const prevNode = parent.child(index - 1);
            if (prevNode && prevNode.type.name === this.name) {
              const cellId = prevNode.attrs.cellId;
              if (cellId) {
                window.dispatchEvent(
                  new CustomEvent('cell-navigation', {
                    detail: { targetCellId: cellId, direction: 'up' },
                  })
                );
                return true;
              }
            }
          }
        }
        return false;
      },
      ArrowDown: ({ editor }) => {
        const { selection } = editor.state;
        const { $to } = selection;

        // Check if at end of current node
        const endOfNode = $to.end($to.depth);
        if ($to.pos === endOfNode) {
          const index = $to.index($to.depth - 1);
          const parent = $to.node($to.depth - 1);

          if (index < parent.childCount - 1) {
            const nextNode = parent.child(index + 1);
            if (nextNode && nextNode.type.name === this.name) {
              const cellId = nextNode.attrs.cellId;
              if (cellId) {
                window.dispatchEvent(
                  new CustomEvent('cell-navigation', {
                    detail: { targetCellId: cellId, direction: 'down' },
                  })
                );
                return true;
              }
            }
          }
        }
        return false;
      },
      ArrowLeft: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;

        if ($from.parentOffset === 0) {
          const index = $from.index($from.depth - 1);
          const parent = $from.node($from.depth - 1);

          if (index > 0) {
            const prevNode = parent.child(index - 1);
            if (prevNode && prevNode.type.name === this.name) {
              const cellId = prevNode.attrs.cellId;
              if (cellId) {
                window.dispatchEvent(
                  new CustomEvent('cell-navigation', {
                    detail: { targetCellId: cellId, direction: 'up' }, // 'up' means focus end
                  })
                );
                return true;
              }
            }
          }
        }
        return false;
      },
      ArrowRight: ({ editor }) => {
        const { selection } = editor.state;
        const { $to } = selection;

        const endOfNode = $to.end($to.depth);
        if ($to.pos === endOfNode) {
          const index = $to.index($to.depth - 1);
          const parent = $to.node($to.depth - 1);

          if (index < parent.childCount - 1) {
            const nextNode = parent.child(index + 1);
            if (nextNode && nextNode.type.name === this.name) {
              const cellId = nextNode.attrs.cellId;
              if (cellId) {
                window.dispatchEvent(
                  new CustomEvent('cell-navigation', {
                    detail: { targetCellId: cellId, direction: 'down' }, // 'down' means focus start
                  })
                );
                return true;
              }
            }
          }
        }
        return false;
      },
    };
  },

  addInputRules() {
    return [
      {
        find: /```(python|javascript|js|typescript|ts|bash|shell)\s*$/,
        handler: ({
          state,
          range,
          match,
        }: {
          state: {
            doc: {
              resolve: (pos: number) => {
                before: (depth: number) => number;
                after: (depth: number) => number;
                depth: number;
              };
            };
            selection: { constructor: { near: (pos: unknown) => unknown } };
          };
          tr: {
            replaceWith: (from: number, to: number, node: unknown) => void;
            setSelection: (sel: unknown) => void;
            setMeta: (key: string, value: unknown) => unknown;
            doc: { content: { size: number }; resolve: (pos: number) => unknown };
          };
          range: { to: number };
          match: string[];
        }) => {
          const language = match[1] || 'python';
          const cellId = uuidv4();
          const { tr } = state;

          const codeBlockNode = this.type.create({
            language,
            code: '',
            cellId,
            outputs: [],
            enableEdit: true,
          });

          const $pos = state.doc.resolve(range.to);
          const fromBlock = $pos.before($pos.depth);
          const toBlock = $pos.after($pos.depth);
          tr.replaceWith(fromBlock, toBlock, codeBlockNode);

          const newDocPos = fromBlock + codeBlockNode.nodeSize;
          if (newDocPos <= tr.doc.content.size) {
            tr.setSelection(TextSelection.near(tr.doc.resolve(newDocPos)));
          }

          tr.setMeta('codeBlockInputRule', true);
          tr.setMeta('newCodeCellId', cellId);
          tr.setMeta('codeBlockLanguage', language);
          return tr;
        },
      },
      {
        find: /```([a-zA-Z]*)\s*$/,
        handler: ({
          state,
          range,
          match,
        }: {
          state: {
            doc: {
              resolve: (pos: number) => {
                before: (depth: number) => number;
                after: (depth: number) => number;
                depth: number;
              };
            };
            selection: { constructor: { near: (pos: unknown) => unknown } };
          };
          tr: {
            replaceWith: (from: number, to: number, node: unknown) => void;
            setSelection: (sel: unknown) => void;
            setMeta: (key: string, value: unknown) => unknown;
            doc: { content: { size: number }; resolve: (pos: number) => unknown };
          };
          range: { to: number };
          match: string[];
        }) => {
          const raw = (match[1] || '').toLowerCase();
          const guess = (lang: string) => {
            if (!lang) return 'python';
            if ('python'.startsWith(lang) || ['py', 'pyth', 'pytho'].includes(lang))
              return 'python';
            if (['js', 'javascript'].some((x) => x.startsWith(lang))) return 'javascript';
            if (['ts', 'typescript'].some((x) => x.startsWith(lang))) return 'typescript';
            if (['bash', 'sh', 'shell'].some((x) => x.startsWith(lang))) return 'bash';
            return 'python';
          };
          const language = guess(raw);
          const cellId = uuidv4();
          const { tr } = state;

          const codeBlockNode = this.type.create({
            language,
            code: '',
            cellId,
            outputs: [],
            enableEdit: true,
          });

          const $pos = state.doc.resolve(range.to);
          const fromBlock = $pos.before($pos.depth);
          const toBlock = $pos.after($pos.depth);
          tr.replaceWith(fromBlock, toBlock, codeBlockNode);

          const newDocPos = fromBlock + codeBlockNode.nodeSize;
          if (newDocPos <= tr.doc.content.size) {
            tr.setSelection(TextSelection.near(tr.doc.resolve(newDocPos)));
          }

          tr.setMeta('codeBlockInputRule', true);
          tr.setMeta('newCodeCellId', cellId);
          tr.setMeta('codeBlockLanguage', language);
          return tr;
        },
      },
    ];
  },
});
