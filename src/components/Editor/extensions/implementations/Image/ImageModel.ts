import { ExtensionFSM, State } from '../../core/ExtensionFSM';
import { Editor } from '@tiptap/core';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { Cell as StoreCell } from '@Store/models';

export interface ImageContext {
  node: ProseMirrorNode;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
  cell?: StoreCell; // Store cell reference
  editor: Editor;
  getPos: () => number;
}

export class ImageModel {
  static createFSM(context: ImageContext, onStateChange: (newState: string) => void) {
    const fsm = new ExtensionFSM<ImageContext>(context, onStateChange);

    const idleState: State<ImageContext> = {
      name: 'idle',
      handleEvent: (event, _payload, _ctx) => {
        switch (event) {
          case 'FOCUS':
            return 'focused';
          case 'START_GENERATION':
            return 'generating';
          case 'LOAD_ERROR':
            return 'error';
          default:
            return null;
        }
      },
    };

    const focusedState: State<ImageContext> = {
      name: 'focused',
      handleEvent: (event, _payload, _ctx) => {
        switch (event) {
          case 'BLUR':
            return 'idle';
          case 'EDIT':
            return 'editing';
          case 'START_GENERATION':
            return 'generating';
          default:
            return null;
        }
      },
    };

    const editingState: State<ImageContext> = {
      name: 'editing',
      handleEvent: (event, payload, ctx) => {
        switch (event) {
          case 'SAVE': {
            // Payload should contain the new markdown
            const { markdown } = payload || {};
            if (markdown) {
              // Validate markdown
              const match = markdown.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
              if (match) {
                // Valid markdown, update attributes
                const alt = match[1];
                const src = match[2];
                ctx.updateAttributes({ markdown, src, alt });
                return 'focused'; // Return to focused after save
              } else {
                // Invalid markdown -> Downgrade to paragraph
                const pos = ctx.getPos();
                if (typeof pos === 'number') {
                  // We need to replace the node.
                  // Since we are inside the node view, we should be careful.
                  // We can use a timeout to let the FSM transition complete or just do it.
                  // But replacing the node will destroy this component, so the FSM will be destroyed.
                  // That's fine.
                  ctx.editor.commands.command(({ tr, dispatch, state }) => {
                    if (dispatch) {
                      const nodeSize = ctx.node.nodeSize;
                      const textNode = state.schema.text(markdown);
                      const paragraph = state.schema.nodes.paragraph.create(null, textNode);
                      tr.replaceWith(pos, pos + nodeSize, paragraph);
                    }
                    return true;
                  });
                  return 'destroyed'; // Terminal state
                }
              }
            }
            return 'focused';
          }
          case 'CANCEL':
            return 'focused';
          case 'BLUR':
            // If user clicks away while editing, we usually save or cancel.
            // Let's assume cancel/save logic is handled by the view's onBlur, which sends SAVE or CANCEL.
            // But if we get a raw BLUR event, we might want to go to idle?
            // But the view is showing an input.
            // Let's stay in editing until explicit SAVE/CANCEL.
            return null;
          default:
            return null;
        }
      },
    };

    const generatingState: State<ImageContext> = {
      name: 'generating',
      handleEvent: (event, _payload, _ctx) => {
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
      handleEvent: (event, _payload, _ctx) => {
        switch (event) {
          case 'RETRY':
            return 'idle'; // Or loading
          case 'EDIT':
            return 'editing';
          case 'FOCUS':
            // Can focus on error state too
            return null;
          default:
            return null;
        }
      },
    };

    fsm.addState(idleState);
    fsm.addState(focusedState);
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
