import React, { useEffect, useState } from 'react';
import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { ExtensionFSM } from './ExtensionFSM';

export interface BaseNodeViewProps<TContext> extends NodeViewProps {
  createFSM: (
    context: TContext,
    onStateChange: (newState: string) => void
  ) => ExtensionFSM<TContext>;
  createContext: (props: NodeViewProps) => TContext;
  renderState: (state: string, context: TContext, fsm: ExtensionFSM<TContext>) => React.ReactNode;
  wrapperComponent?: React.ElementType;
}

export function BaseNodeView<TContext>({
  node,
  updateAttributes,
  createFSM,
  createContext,
  renderState,
  wrapperComponent = 'div',
  ...props
}: BaseNodeViewProps<TContext>) {
  const [currentState, setCurrentState] = useState(node.attrs.fsmState || 'idle');

  // Create context - we need to update it on every render to keep it fresh
  const context = createContext({ node, updateAttributes, ...props });

  // Initialize FSM once
  const [fsm] = useState(() => {
    return createFSM(context, (newState) => {
      setCurrentState(newState);
    });
  });

  // Update FSM context on every render so it has access to latest node/props
  fsm.updateContext(context);

  const prevFsmStateRef = React.useRef(node.attrs.fsmState);

  // Sync Tiptap attributes when local state changes
  useEffect(() => {
    if (currentState !== node.attrs.fsmState) {
      updateAttributes({ fsmState: currentState });
    }
  }, [currentState, node.attrs.fsmState, updateAttributes]);

  // Sync local state from attributes if changed externally (e.g. undo/redo)
  useEffect(() => {
    const prevFsmState = prevFsmStateRef.current;
    const newFsmState = node.attrs.fsmState;

    if (newFsmState !== prevFsmState) {
      // External change detected (or our own update coming back)
      if (newFsmState && newFsmState !== currentState) {
        setCurrentState(newFsmState);

        if (fsm.getCurrentState() !== newFsmState) {
          try {
            fsm.transitionTo(newFsmState);
          } catch (e) {
            console.warn('Failed to sync FSM state:', e);
          }
        }
      }
      prevFsmStateRef.current = newFsmState;
    }
  }, [node.attrs.fsmState, currentState, fsm]);

  // Monitor selection to trigger FOCUS/BLUR
  useEffect(() => {
    if (!props.editor) return;

    const handleSelectionUpdate = () => {
      const { selection } = props.editor.state;
      const pos = props.getPos();

      if (typeof pos !== 'number') return;

      const nodeSize = node.nodeSize;
      const isSelected =
        (selection.from >= pos && selection.to <= pos + nodeSize) || // Cursor inside or selection inside
        (selection.from <= pos && selection.to >= pos + nodeSize); // Node fully selected

      const currentFsmState = fsm.getCurrentState();

      if (isSelected) {
        if (currentFsmState === 'idle') {
          fsm.send('FOCUS');
        }
      } else {
        if (currentFsmState === 'focused' || currentFsmState === 'editing') {
          // Only blur if we are not in a state that should persist (like editing might want to persist if we click outside? No, usually click outside means save/cancel)
          // But let's let the FSM decide.
          fsm.send('BLUR');
        }
      }
    };

    props.editor.on('selectionUpdate', handleSelectionUpdate);

    // Initial check
    handleSelectionUpdate();

    return () => {
      props.editor.off('selectionUpdate', handleSelectionUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.editor, props.getPos, fsm, node.nodeSize]); // props object changes on every render, use specific props

  return (
    <NodeViewWrapper
      as={wrapperComponent}
      className={`extension-wrapper state-${currentState}`}
      data-cell-id={node.attrs.cellId}
    >
      {renderState(currentState, context, fsm)}
    </NodeViewWrapper>
  );
}
