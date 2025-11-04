/**
 * Cursor positioning utilities for enhanced editor UX
 * Provides consistent cursor positioning behavior across TipTap and Jupyter editors
 */

/**
 * Position cursor at the end of a CodeMirror editor
 */
export const focusCodeMirrorAtEnd = (cmElement: HTMLElement): boolean => {
  try {
    const cmEditor = cmElement.closest('.cm-editor') as any;
    if (cmEditor && cmEditor.CodeMirror) {
      const doc = cmEditor.CodeMirror.getDoc();
      const lastLine = doc.lastLine();
      const lastLineLength = doc.getLine(lastLine).length;
      doc.setCursor(lastLine, lastLineLength);
      return true;
    }
  } catch (e) {
    console.warn('Failed to position CodeMirror cursor:', e);
  }
  return false;
};

/**
 * Position cursor at the end of a text input/textarea
 */
export const focusTextInputAtEnd = (element: HTMLInputElement | HTMLTextAreaElement): boolean => {
  try {
    if (element.setSelectionRange) {
      const length = element.value?.length || 0;
      element.setSelectionRange(length, length);
      return true;
    }
  } catch (e) {
    console.warn('Failed to position text input cursor:', e);
  }
  return false;
};

/**
 * Find and focus the appropriate editor element within a cell
 */
export const focusCellEditor = (cellElement: HTMLElement, focusAtEnd: boolean = true): boolean => {
  const editors = [
    cellElement.querySelector('.cm-editor .cm-content'),
    cellElement.querySelector('textarea'),
    cellElement.querySelector('input[type="text"]'),
    cellElement.querySelector('[contenteditable="true"]')
  ].filter(Boolean) as HTMLElement[];

  for (const editor of editors) {
    try {
      editor.focus();
      
      if (focusAtEnd) {
        // Try different positioning methods based on editor type
        if (editor.classList.contains('cm-content')) {
          focusCodeMirrorAtEnd(editor);
        } else if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
          focusTextInputAtEnd(editor as HTMLInputElement);
        } else if (editor.contentEditable === 'true') {
          // For contenteditable elements, position cursor at end
          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(editor);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
      return true;
    } catch (e) {
      console.warn('Failed to focus editor element:', e);
    }
  }
  return false;
};

/**
 * Check if an element is a blank/empty area that should trigger end-focus behavior
 */
export const isBlankArea = (element: HTMLElement): boolean => {
  return !!(element && (
    element.classList.contains('ProseMirror') ||
    element.classList.contains('tiptap-notebook-editor') ||
    element.classList.contains('tiptap-notebook-editor-container') ||
    element.classList.contains('jupyter-notebook-editor') ||
    (element.tagName === 'DIV' && !element.textContent?.trim() && !element.querySelector('*'))
  ));
};

/**
 * Enhanced focus behavior for notebook editors
 * Focuses on the last cell and positions cursor at the end
 */
export const focusNotebookAtEnd = (containerElement: HTMLElement): boolean => {
  try {
    const cellElements = containerElement.querySelectorAll('[data-cell-id]');
    const lastCell = cellElements[cellElements.length - 1] as HTMLElement;
    
    if (lastCell) {
      const success = focusCellEditor(lastCell, true);
      if (success) {
        // Trigger any focus event handlers
        lastCell.dispatchEvent(new Event('focus', { bubbles: true }));
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to focus notebook at end:', e);
  }
  return false;
};

/**
 * Debounced focus function to prevent rapid fire focusing
 */
let focusTimeout: NodeJS.Timeout | null = null;
export const debouncedFocus = (focusFunction: () => void, delay: number = 10): void => {
  if (focusTimeout) {
    clearTimeout(focusTimeout);
  }
  focusTimeout = setTimeout(focusFunction, delay);
};