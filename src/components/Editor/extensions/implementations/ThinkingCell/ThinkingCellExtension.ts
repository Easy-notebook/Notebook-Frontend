import { BaseExtension } from '../../core/BaseExtension';
import { ThinkingCellView } from './ThinkingCellView';
import { mergeAttributes } from '@tiptap/core';
import { v4 as uuidv4 } from 'uuid';

export const ThinkingCellExtension = BaseExtension.create({
  name: 'thinkingCell',
  component: ThinkingCellView,
}).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cellId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-cell-id'),
        renderHTML: (attrs) => ({
          'data-cell-id': attrs.cellId,
        }),
      },
      agentName: {
        default: 'AI',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-agent-name') || 'AI',
        renderHTML: (attrs) => ({
          'data-agent-name': attrs.agentName,
        }),
      },
      customText: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const text = element.getAttribute('data-custom-text');
          return text ? decodeURIComponent(text) : null;
        },
        renderHTML: (attrs) => ({
          'data-custom-text': attrs.customText ? encodeURIComponent(attrs.customText) : '',
        }),
      },
      textArray: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          const attr = element.getAttribute('data-text-array');
          if (!attr) return [];
          try {
            return JSON.parse(decodeURIComponent(attr));
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          'data-text-array': encodeURIComponent(JSON.stringify(attrs.textArray || [])),
        }),
      },
      useWorkflowThinking: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-use-workflow-thinking') === 'true',
        renderHTML: (attrs) => ({
          'data-use-workflow-thinking': String(attrs.useWorkflowThinking),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="thinking-cell"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'thinking-cell',
        'data-cell-id': node.attrs.cellId,
        'data-agent-name': node.attrs.agentName,
        'data-custom-text': node.attrs.customText ? encodeURIComponent(node.attrs.customText) : '',
        'data-text-array': encodeURIComponent(JSON.stringify(node.attrs.textArray || [])),
        'data-use-workflow-thinking': String(node.attrs.useWorkflowThinking),
      }),
    ];
  },

  addCommands() {
    return {
      setThinkingCell:
        (attributes: any) =>
        ({ commands }: any) => {
          if (!attributes.cellId) {
            attributes.cellId = uuidv4();
          }
          return commands.setNode(this.name, attributes);
        },
      insertThinkingCell:
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
    };
  },
});
