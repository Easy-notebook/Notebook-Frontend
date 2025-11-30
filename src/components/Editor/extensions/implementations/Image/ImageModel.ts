import { ExtensionFSM, State } from '../../core/ExtensionFSM';

export interface ImageContext {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
  cell?: any; // Store cell reference
}

export class ImageModel {
  static createFSM(context: ImageContext, onStateChange: (newState: string) => void) {
    const fsm = new ExtensionFSM<ImageContext>(context, onStateChange);

    const idleState: State<ImageContext> = {
      name: 'idle',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'EDIT':
            return 'editing';
          case 'START_GENERATION':
            return 'generating';
          case 'LOAD_ERROR':
            return 'error';
          default:
            return null;
        }
      },
    };

    const editingState: State<ImageContext> = {
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

    const generatingState: State<ImageContext> = {
      name: 'generating',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'GENERATION_COMPLETE':
            return 'idle';
          case 'GENERATION_ERROR':
            return 'error';
          default:
            return null;
        }
      },
    };

    const errorState: State<ImageContext> = {
      name: 'error',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'RETRY':
            return 'idle'; // Or loading
          case 'EDIT':
            return 'editing';
          default:
            return null;
        }
      },
    };

    fsm.addState(idleState);
    fsm.addState(editingState);
    fsm.addState(generatingState);
    fsm.addState(errorState);

    // Initial state determination based on node/cell state
    let initialState = context.node.attrs.fsmState || 'idle';
    if (context.cell?.metadata?.isGenerating) {
      initialState = 'generating';
    }

    fsm.transitionTo(initialState);

    return fsm;
  }
}
