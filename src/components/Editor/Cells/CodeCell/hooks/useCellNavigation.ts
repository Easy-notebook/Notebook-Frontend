import { useCallback, useEffect, useRef } from 'react';
import useStore from '@Store/notebookStore';
import editorLogger from '@Utils/logger/editor_logger';
import { Cell, ReactCodeMirrorRef } from '../utils/types';

/**
 * Hook to handle cell navigation with arrow keys
 */
export const useCellNavigation = (
  cell: Cell,
  editorRef: React.RefObject<ReactCodeMirrorRef>,
  isCurrentCell: boolean,
  dslcMode: boolean
) => {
  const { cells, setCurrentCell, setEditingCellId } = useStore();
  const lastNavigationDirection = useRef<'up' | 'down' | null>(null);

  // Check if cursor is at first line
  const isCursorAtFirstLine = useCallback(() => {
    if (!editorRef.current?.view) return false;
    const view = editorRef.current.view;
    const state = view.state;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return line.number === 1;
  }, [editorRef]);

  // Check if cursor is at last line
  const isCursorAtLastLine = useCallback(() => {
    if (!editorRef.current?.view) return false;
    const view = editorRef.current.view;
    const state = view.state;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return line.number === state.doc.lines;
  }, [editorRef]);

  // Check if cursor is at document start
  const isCursorAtDocStart = useCallback(() => {
    if (!editorRef.current?.view) return false;
    const view = editorRef.current.view;
    const state = view.state;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return cursorPos === line.from && line.number === 1;
  }, [editorRef]);

  // Check if cursor is at document end
  const isCursorAtDocEnd = useCallback(() => {
    if (!editorRef.current?.view) return false;
    const view = editorRef.current.view;
    const state = view.state;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return cursorPos === line.to && line.number === state.doc.lines;
  }, [editorRef]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const state = useStore.getState();
      const navCells = state.getCurrentViewCells ? state.getCurrentViewCells() : state.cells;
      const currentIndex = navCells.findIndex((c) => c.id === cell.id);

      // Backspace at start of empty code cell: Convert to markdown
      if (event.key === 'Backspace' && isCursorAtDocStart() && !cell.content.trim()) {
        event.preventDefault();
        // Convert code cell to markdown cell
        const { updateCellType } = useStore.getState();
        updateCellType(cell.id, 'markdown');
        // Focus the markdown cell for editing
        setTimeout(() => {
          setEditingCellId(cell.id);
        }, 50);
        return 'convert';
      }

      // Ctrl+Enter: Execute cell
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        return 'execute';
      }

      // Alt+Arrow: Navigate between cells
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const newIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;

        if (newIndex >= 0 && newIndex < cells.length) {
          const targetCell = cells[newIndex];
          setTimeout(() => {
            if (targetCell.type === 'code') {
              setCurrentCell(targetCell.id);
              if (editorRef.current?.view) {
                editorRef.current.view.focus();
              }
            } else if (targetCell.type === 'markdown') {
              setCurrentCell(targetCell.id);
              setEditingCellId(targetCell.id);
            }
          }, 0);
        }
        return 'navigate';
      }

      // Arrow Up/Down: Cross-cell navigation at boundaries
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const direction = event.key === 'ArrowUp' ? 'up' : 'down';
        const isAtFirstLine = event.key === 'ArrowUp' && isCursorAtFirstLine();
        const isAtLastLine = event.key === 'ArrowDown' && isCursorAtLastLine();

        const cursorInfo = {
          line: 0,
          isAtFirstLine,
          isAtLastLine,
          isAtDocStart: isCursorAtDocStart(),
          isAtDocEnd: isCursorAtDocEnd(),
        };

        editorLogger.logNavigationAttempt(cell.id, 'code', direction, cursorInfo);

        if (isAtFirstLine || isAtLastLine) {
          event.preventDefault();
          const newIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;

          if (newIndex >= 0 && newIndex < cells.length) {
            const targetCell = cells[newIndex];
            editorLogger.logNavigationSuccess(
              cell.id,
              targetCell.id,
              'code',
              targetCell.type as string,
              direction
            );

            if (targetCell.type === 'code') {
              const targetCodeElement = document.querySelector(`[data-cell-id="${targetCell.id}"]`);
              if (targetCodeElement) {
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('cell-navigation', {
                      detail: { targetCellId: targetCell.id, direction },
                    })
                  );
                }, 0);
              }
              setCurrentCell(targetCell.id);
            } else if (targetCell.type === 'markdown') {
              setEditingCellId(targetCell.id);
            } else {
              setCurrentCell(targetCell.id);
            }
          } else {
            editorLogger.logNavigationBlocked(
              cell.id,
              'code',
              direction,
              'no_target_cell_available'
            );
          }
          return 'navigate';
        } else {
          editorLogger.logNavigationBlocked(cell.id, 'code', direction, 'cursor_not_at_boundary');
        }
      }

      // Arrow Left/Right: Cross-cell navigation at document boundaries
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const atStart = event.key === 'ArrowLeft' && isCursorAtDocStart();
        const atEnd = event.key === 'ArrowRight' && isCursorAtDocEnd();
        if (atStart || atEnd) {
          event.preventDefault();
          const newIndex = atStart ? currentIndex - 1 : currentIndex + 1;
          if (newIndex >= 0 && newIndex < cells.length) {
            const targetCell = cells[newIndex];
            if (targetCell.type === 'code') {
              setCurrentCell(targetCell.id);
            } else if (targetCell.type === 'markdown') {
              setEditingCellId(targetCell.id);
            } else {
              setCurrentCell(targetCell.id);
            }
          }
          return 'navigate';
        }
      }

      return null;
    },
    [
      cell.id,
      cell.content,
      cells,
      setCurrentCell,
      setEditingCellId,
      isCursorAtFirstLine,
      isCursorAtLastLine,
      isCursorAtDocStart,
      isCursorAtDocEnd,
      editorRef,
    ]
  );

  // Listen for cross-cell navigation events
  useEffect(() => {
    const handleCellNavigation = (event: CustomEvent) => {
      if (event.detail?.targetCellId === cell.id) {
        lastNavigationDirection.current = event.detail.direction;
      }
    };

    window.addEventListener('cell-navigation', handleCellNavigation as EventListener);
    return () => {
      window.removeEventListener('cell-navigation', handleCellNavigation as EventListener);
    };
  }, [cell.id]);

  // Focus editor when becoming current cell
  useEffect(() => {
    if (isCurrentCell && !dslcMode) {
      setTimeout(() => {
        try {
          if (editorRef.current?.view) {
            const view = editorRef.current.view;
            view.focus();

            // Position cursor based on navigation direction
            if (lastNavigationDirection.current === 'down') {
              const pos = 0;
              view.dispatch({
                selection: { anchor: pos, head: pos },
              });
            } else if (lastNavigationDirection.current === 'up') {
              const pos = view.state.doc.length;
              view.dispatch({
                selection: { anchor: pos, head: pos },
              });
            }

            lastNavigationDirection.current = null;
            editorLogger.logFocusChange(cell.id, 'code', true);
          }
        } catch {
          // Ignore focus errors
        }
      }, 100);
    }
  }, [isCurrentCell, dslcMode, cell.id, editorRef]);

  return {
    handleKeyDown,
    isCursorAtFirstLine,
    isCursorAtLastLine,
    isCursorAtDocStart,
    isCursorAtDocEnd,
  };
};
