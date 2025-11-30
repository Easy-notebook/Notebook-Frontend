import { BaseExtension } from '../../core/BaseExtension';
import { CodeBlockView } from './CodeBlockView';
import { mergeAttributes } from '@tiptap/core';
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
        (attributes: any) =>
        ({ commands }: any) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4();
          }
          return commands.setNode(this.name, attributes);
        },
      insertExecutableCodeBlock:
        (attributes: any) =>
        ({ commands }: any) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4();
          }
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    } as any;
  },

  addInputRules() {
    return [
      {
        find: /```(python|javascript|js|typescript|ts|bash|shell)\s*$/,
        handler: ({ state, range, match }: any) => {
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
        handler: ({ state, range, match }: any) => {
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
