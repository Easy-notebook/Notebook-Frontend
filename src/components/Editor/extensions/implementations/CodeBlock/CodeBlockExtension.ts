import { BaseExtension } from '../../core/BaseExtension';
import { CodeBlockView } from './CodeBlockView';
import { v4 as uuidv4 } from 'uuid';
import { decodeCodeOutputs } from '../../../utils/codeCellAttributes';
import { InputRule, mergeAttributes, type CommandProps } from '@tiptap/core';
import { commitFenceInput } from '../../../TipTap/model/fenceInput';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    executableCodeBlock: {
      setExecutableCodeBlock: (attributes: Record<string, unknown>) => ReturnType;
      insertExecutableCodeBlock: (attributes: Record<string, unknown>) => ReturnType;
    };
  }
}

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
          return decodeCodeOutputs(element.getAttribute('data-outputs'));
        },
        renderHTML: (attributes) => ({
          'data-outputs': encodeURIComponent(JSON.stringify(decodeCodeOutputs(attributes.outputs))),
        }),
      },
      enableEdit: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-enable-edit') !== 'false',
        renderHTML: (attributes) => ({
          'data-enable-edit': String(attributes.enableEdit),
        }),
      },
      originalType: {
        default: 'code',
        parseHTML: (element) => element.getAttribute('data-original-type') || 'code',
        renderHTML: (attributes) => ({
          'data-original-type': attributes.originalType || 'code',
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

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'executable-code-block' })];
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
        ({ commands }: CommandProps) => {
          return commands.setNode(this.name, { ...attributes, cellId: attributes.cellId || uuidv4() });
        },
      insertExecutableCodeBlock:
        (attributes: Record<string, unknown>) =>
        ({ commands }: CommandProps) => {
          return commands.insertContent({
            type: this.name,
            attrs: { ...attributes, cellId: attributes.cellId || uuidv4() },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isEditable || editor.view.composing) return false;
        const { selection } = editor.state;
        if (!selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false;
        return editor.commands.command(({ state }) => commitFenceInput(
          state, selection.$from.start(), selection.to, selection.$from.parent.textContent
        ));
      },
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
      new InputRule({
        find: /^```([\w+-]*)[ \t]+$/,
        handler: ({ state, range, match }) => {
          if (this.editor.isDestroyed || !this.editor.isEditable) return null;
          if (!commitFenceInput(state, range.from, range.to, match[0])) return null;
        },
      }),
    ];
  },
});
