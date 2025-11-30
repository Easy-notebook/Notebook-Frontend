import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ComponentType } from 'react';

export interface BaseExtensionOptions {
  name: string;
  component: ComponentType<any>;
}

export abstract class BaseExtension {
  static create<Options extends BaseExtensionOptions>(options: Options) {
    return Node.create({
      name: options.name,
      group: 'block',
      atom: true,

      addAttributes() {
        return {
          // Default attributes for all extensions
          cellId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-cell-id'),
            renderHTML: (attributes) => ({
              'data-cell-id': attributes.cellId,
            }),
          },
          // State attribute to track FSM state
          fsmState: {
            default: 'idle',
            parseHTML: (element) => element.getAttribute('data-fsm-state') || 'idle',
            renderHTML: (attributes) => ({
              'data-fsm-state': attributes.fsmState,
            }),
          },
        };
      },

      parseHTML() {
        return [
          {
            tag: `div[data-type="${options.name}"]`,
          },
        ];
      },

      renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': options.name })];
      },

      addNodeView() {
        return ReactNodeViewRenderer(options.component);
      },
    });
  }
}
