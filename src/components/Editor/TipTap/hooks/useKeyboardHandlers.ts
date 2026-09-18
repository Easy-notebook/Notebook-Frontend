/**
 * Keyboard Handlers Hook
 * Handles special keyboard shortcuts for the TipTap editor
 */

import { EditorView } from 'prosemirror-view';
import { Selection } from 'prosemirror-state';
import { debouncedFocus } from '@Editor/utils/cursorPositioning';

export function useKeyboardHandlers() {
  const handleKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
    // Handle Tab key
    if (event.key === 'Tab') {
      event.preventDefault();
      return true;
    }

    // Handle Ctrl/Cmd + End - Jump to end of document
    if ((event.ctrlKey || event.metaKey) && event.key === 'End') {
      event.preventDefault();
      debouncedFocus(() => {
        const state = view.state;
        const doc = state.doc;
        const $end = doc.resolve(Math.max(0, doc.content.size - 1));
        const selection = Selection.near($end, 1);
        const tr = state.tr.setSelection(selection);
        view.dispatch(tr);
      });
      return true;
    }

    // Handle Home key - Jump to beginning of line/document
    if (event.key === 'Home') {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        debouncedFocus(() => {
          const state = view.state;
          const $start = state.doc.resolve(0);
          const selection = Selection.near($start, 1);
          const tr = state.tr.setSelection(selection);
          view.dispatch(tr);
        });
        return true;
      }
    }

    // Handle Backspace - Downgrade special nodes to paragraph instead of deleting
    if (event.key === 'Backspace') {
      const { selection } = view.state;
      const { empty, $from } = selection;

      if (empty && $from.parent.type.name === 'paragraph' && view.endOfTextblock('backward')) {
        // Check previous node
        const prevNode = $from.nodeBefore;

        if (
          prevNode &&
          ['executableCodeBlock', 'thinkingCell', 'rawBlock'].includes(prevNode.type.name)
        ) {
          event.preventDefault();

          // Get content from special node
          let textContent = prevNode.textContent;

          // Create transaction to replace special node with paragraph
          const tr = view.state.tr;
          const prevNodePos = $from.pos - prevNode.nodeSize; // Position of previous node

          // Delete the special node
          tr.delete(prevNodePos, $from.pos);

          // Insert paragraph with content
          const schema = view.state.schema;
          const paragraph = schema.nodes.paragraph.create(null, schema.text(textContent || ' '));

          tr.insert(prevNodePos, paragraph);

          // Set selection to end of new paragraph
          // The new paragraph is at prevNodePos. Its size is textContent.length + 2 (start/end tags)
          // We want cursor at the end of the text.
          const newPos = prevNodePos + (textContent ? textContent.length : 0) + 1;
          const newSelection = Selection.near(tr.doc.resolve(newPos));
          tr.setSelection(newSelection);

          view.dispatch(tr);
          return true;
        }
      }
    }

    // Handle ArrowUp - Ensure we can enter special blocks from below
    if (event.key === 'ArrowUp') {
      const { selection } = view.state;
      const { empty, $from } = selection;
      if (empty && view.endOfTextblock('backward')) {
        const prevNode = $from.nodeBefore;
        if (
          prevNode &&
          ['executableCodeBlock', 'thinkingCell', 'rawBlock'].includes(prevNode.type.name)
        ) {
          // Logic to ensure we don't skip special blocks can be added here if needed.
          // For now, we trust default behavior but keep this hook ready.
        }
      }
    }

    return false;
  };

  return { handleKeyDown };
}
