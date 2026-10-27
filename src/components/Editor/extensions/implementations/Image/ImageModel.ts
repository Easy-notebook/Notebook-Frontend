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
  getPos: () => number | undefined;
  onSave?: (markdown: string) => void;
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
            const markdown: unknown = payload?.markdown;
            if (typeof markdown !== 'string') return null;
            const pos = ctx.getPos();
            if (typeof pos !== 'number') return null;
            const ownsNode = (node: ProseMirrorNode | null): boolean =>
              !!node &&
              node.type === ctx.node.type &&
              (ctx.node.attrs.cellId
                ? node.attrs.cellId === ctx.node.attrs.cellId
                : node === ctx.node);
            if (!ownsNode(ctx.editor.state.doc.nodeAt(pos))) return null;

            const match = markdown.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
            if (match) {
              ctx.updateAttributes({ markdown, src: match[2], alt: match[1] });
              ctx.onSave?.(markdown);
              return 'focused';
            }

            const replaced = ctx.editor.commands.command(({ tr, dispatch, state }) => {
              const current = tr.doc.nodeAt(pos);
              if (!ownsNode(current)) return false;
              if (dispatch) {
                // markdownImage is inline: retain the surrounding paragraph and text.
                tr.replaceWith(
                  pos,
                  pos + current!.nodeSize,
                  markdown ? state.schema.text(markdown) : []
                );
              }
              return true;
            });
            if (!replaced) return null;
            ctx.onSave?.(markdown);
            return 'destroyed';
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
    fsm.addState({ name: 'destroyed' });

    // Initial state determination based on node/cell state
    let initialState = context.node.attrs.fsmState || 'idle';
    if (context.cell?.metadata?.isGenerating) {
      initialState = 'generating';
    }

    fsm.transitionTo(initialState);

    return fsm;
  }
}
