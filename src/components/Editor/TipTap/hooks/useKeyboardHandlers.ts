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

    return false;
  };

  return { handleKeyDown };
}
