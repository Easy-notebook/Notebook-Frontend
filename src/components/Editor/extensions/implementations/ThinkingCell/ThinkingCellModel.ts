import { ExtensionFSM, State } from '../../core/ExtensionFSM';

export interface ThinkingCellContext {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
}

export class ThinkingCellModel {
  static createFSM(context: ThinkingCellContext, onStateChange: (newState: string) => void) {
    const fsm = new ExtensionFSM<ThinkingCellContext>(context, onStateChange);

    const idleState: State<ThinkingCellContext> = {
      name: 'idle',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'START_THINKING':
            return 'thinking';
          default:
            return null;
        }
      },
    };

    const thinkingState: State<ThinkingCellContext> = {
      name: 'thinking',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'FINISH_THINKING':
            return 'completed';
          case 'UPDATE_THOUGHTS':
            // Logic to update thoughts could be here or handled by external store updates
            // triggering re-renders.
            // For now, we just stay in thinking state.
            return null;
          default:
            return null;
        }
      },
    };

    const completedState: State<ThinkingCellContext> = {
      name: 'completed',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'RESTART':
            return 'thinking';
          default:
            return null;
        }
      },
    };

    fsm.addState(idleState);
    fsm.addState(thinkingState);
    fsm.addState(completedState);

    // Initial state logic
    // If textArray has content, we might be completed or thinking.
    // For now, default to idle or check attributes.
    // If it's a new cell, it might start in idle.
    let initialState = context.node.attrs.fsmState || 'idle';

    // Auto-detect state based on attributes if fsmState is missing
    if (!context.node.attrs.fsmState) {
      if (context.node.attrs.textArray && context.node.attrs.textArray.length > 0) {
        // If we have thoughts, we assume it's completed unless specified otherwise
        initialState = 'completed';
      }
    }

    fsm.transitionTo(initialState);

    return fsm;
  }
}
