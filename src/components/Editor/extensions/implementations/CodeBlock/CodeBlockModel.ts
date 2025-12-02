import { ExtensionFSM, State } from '../../core/ExtensionFSM';
import { v4 as uuidv4 } from 'uuid';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { Editor } from '@tiptap/core';

export interface CodeBlockContext {
  node: ProseMirrorNode;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
  editor?: Editor;
  getPos?: () => number;
}

export class CodeBlockModel {
  static createFSM(context: CodeBlockContext, onStateChange: (newState: string) => void) {
    const fsm = new ExtensionFSM<CodeBlockContext>(context, onStateChange);

    // Define States
    const idleState: State<CodeBlockContext> = {
      name: 'idle',
      onEnter: (ctx) => {
        // Ensure cellId exists
        if (!ctx.node.attrs.cellId) {
          ctx.updateAttributes({ cellId: uuidv4() });
        }
      },
      handleEvent: (event, _payload, _ctx) => {
        switch (event) {
          case 'FOCUS':
            return 'focused';
          case 'EDIT':
            return 'editing';
          case 'DELETE':
            // Handle deletion logic here or delegate to view
            return null;
          default:
            return null;
        }
      },
    };

    const focusedState: State<CodeBlockContext> = {
      name: 'focused',
      handleEvent: (event, _payload, _ctx) => {
        switch (event) {
          case 'BLUR':
            return 'idle';
          case 'EDIT':
            return 'editing';
          default:
            return null;
        }
      },
    };

    const editingState: State<CodeBlockContext> = {
      name: 'editing',
      handleEvent: (event, _payload, _ctx) => {
        switch (event) {
          case 'BLUR':
            return 'idle'; // Or stay in editing if we want to persist edit mode?
          case 'CANCEL':
            return 'focused';
          case 'SAVE':
            return 'focused';
          default:
            return null;
        }
      },
    };

    fsm.addState(idleState);
    fsm.addState(focusedState);
    fsm.addState(editingState);

    // Initial transition
    fsm.transitionTo(context.node.attrs.fsmState || 'idle');

    return fsm;
  }
}
