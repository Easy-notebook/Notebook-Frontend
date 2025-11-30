import { ExtensionFSM, State } from '../../core/ExtensionFSM';
import { v4 as uuidv4 } from 'uuid';

export interface CodeBlockContext {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
  editor?: any;
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
      handleEvent: (event, payload, ctx) => {
        switch (event) {
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

    const editingState: State<CodeBlockContext> = {
      name: 'editing',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'BLUR':
            return 'idle';
          default:
            return null;
        }
      },
    };

    fsm.addState(idleState);
    fsm.addState(editingState);

    // Initial transition
    fsm.transitionTo(context.node.attrs.fsmState || 'idle');

    return fsm;
  }
}
