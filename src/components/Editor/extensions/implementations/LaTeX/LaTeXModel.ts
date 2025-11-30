import { ExtensionFSM, State } from '../../core/ExtensionFSM';

export interface LaTeXContext {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
}

export class LaTeXModel {
  static createFSM(context: LaTeXContext, onStateChange: (newState: string) => void) {
    const fsm = new ExtensionFSM<LaTeXContext>(context, onStateChange);

    const idleState: State<LaTeXContext> = {
      name: 'idle',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'EDIT':
            return 'editing';
          default:
            return null;
        }
      },
    };

    const editingState: State<LaTeXContext> = {
      name: 'editing',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'SAVE':
          case 'CANCEL':
            return 'idle';
          default:
            return null;
        }
      },
    };

    fsm.addState(idleState);
    fsm.addState(editingState);

    // Initial state logic
    // If latex content exists, idle. If not (newly created), editing.
    let initialState =
      context.node.attrs.fsmState || (context.node.attrs.latex ? 'idle' : 'editing');

    fsm.transitionTo(initialState);

    return fsm;
  }
}
