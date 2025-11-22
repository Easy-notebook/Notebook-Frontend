/**
 * Editor Events Hook
 * Handles TipTap editor lifecycle events (onCreate, onUpdate, onBlur, onDestroy, onTransaction)
 */

import { useRef } from 'react';
import { Editor, EditorEvents } from '@tiptap/react';
import type { Cell } from '@Store/models';
import { convertEditorStateToCells } from '@Editor/utils/cellConverters';
import useStore from '@Store/notebookStore';

const DEBUG = false;

interface UseEditorEventsProps {
  cells: Cell[];
  setCells: (cells: Cell[]) => void;
  isInternalUpdate: React.MutableRefObject<boolean>;
  syncTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastInsertedCodeCellIdRef: React.MutableRefObject<string | null>;
  setCurrentEditor: (editor: Editor | null) => void;
  editorRef: React.MutableRefObject<Editor | null>;
}

export function useEditorEvents({
  cells,
  setCells,
  isInternalUpdate,
  syncTimeoutRef,
  lastInsertedCodeCellIdRef,
  setCurrentEditor,
  editorRef,
}: UseEditorEventsProps) {
  const onCreate = ({ editor }: EditorEvents['create']) => {
    try {
      if (editor) {
        editorRef.current = editor;
        setCurrentEditor(editor);
      }
    } catch (error) {
      console.warn('TipTap onCreate error:', error);
    }
  };

  const onDestroy = () => {
    try {
      // Force final sync when editor is destroyed
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }

      // Safely attempt to sync state one last time
      const editorInstance = editorRef.current;
      if (editorInstance && typeof convertEditorStateToCells === 'function') {
        const newCells = convertEditorStateToCells(editorInstance);
        if (newCells && setCells && typeof setCells === 'function' && cells) {
          if (JSON.stringify(newCells) !== JSON.stringify(cells)) {
            console.log('📝 TipTap onDestroy: Final force sync for auto-save');
            setCells(newCells);
          }
        }
      }
    } catch (error) {
      console.warn('TipTap onDestroy error (safe to ignore during unmount):', error);
    }
  };

  const onTransaction = ({ editor, transaction }: EditorEvents['transaction']) => {
    try {
      if (!editor || !transaction) return;

      const isCodeBlockInputRule = transaction?.getMeta('codeBlockInputRule');
      if (isCodeBlockInputRule) {
        const newCodeCellId = transaction?.getMeta('newCodeCellId');
        // Update store selection so CodeCell can autoFocus
        try {
          const storeState = useStore.getState();
          if (storeState?.setCurrentCell) {
            const setCurrentCell = storeState.setCurrentCell;
            const setEditingCellId = storeState.setEditingCellId;
            if (newCodeCellId && setCurrentCell) {
              setCurrentCell(newCodeCellId);
              setEditingCellId?.(newCodeCellId);
            }
          }
        } catch (storeError) {
          console.warn('Store access failed in onTransaction:', storeError);
        }
        lastInsertedCodeCellIdRef.current = newCodeCellId || null;
        setTimeout(() => {
          const codeElement = document.querySelector(
            `[data-cell-id="${newCodeCellId}"] .cm-editor .cm-content`
          );
          if (codeElement) {
            (codeElement as HTMLElement).focus();
          }
        }, 60);
      }
    } catch (error) {
      console.warn('TipTap onTransaction error:', error);
    }
  };

  const onUpdate = ({ editor }: EditorEvents['update']) => {
    try {
      if (!editor || isInternalUpdate.current) return;

      // Reduce debounce time, improve real-time save responsiveness
      const debounceTime = 50;

      // Use debounce to delay sync, avoid frequent updates
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        const newCells = convertEditorStateToCells(editor);

        // Optimize comparison logic: reduce unnecessary deep comparison
        const structuralChange =
          newCells.length !== cells.length ||
          newCells.some((newCell, index) => {
            const existingCell = cells[index];
            return (
              !existingCell || newCell.type !== existingCell.type || newCell.id !== existingCell.id
            );
          });

        // Collect cells with only Markdown content changes
        const markdownDiffs: Array<{ id: string; content: string }> = [];
        newCells.forEach((newCell, index) => {
          if (newCell.type === 'markdown') {
            const existingCell = cells[index];
            if (
              existingCell &&
              existingCell.type === 'markdown' &&
              newCell.content !== existingCell.content
            ) {
              markdownDiffs.push({ id: existingCell.id, content: newCell.content as string });
            }
          }
        });

        if (structuralChange) {
          isInternalUpdate.current = true;

          if (DEBUG) {
            console.log('=== TiptapNotebookEditor 结构变化 Debug Info ===');
            console.log(
              '原有cells:',
              cells.map((c, i) => ({ index: i, id: c.id, type: c.type }))
            );
            console.log(
              '新解析cells:',
              newCells.map((c, i) => ({ index: i, id: c.id, type: c.type }))
            );
          }

          // Smart merge: keep existing code block integrity, only update markdown content
          let currentCells = cells; // fallback to current cells
          try {
            const storeState = useStore.getState();
            if (storeState?.cells) {
              currentCells = storeState.cells;
            }
          } catch (storeError) {
            console.warn('Store access failed in merging cells:', storeError);
          }
          const mergedCells: Cell[] = newCells.map((newCell, index) => {
            if (newCell.type === 'code') {
              // For code cells always keep existing store data
              const existingCodeCell = currentCells.find(
                (cell: Cell) => cell.type === 'code' && cell.id === newCell.id
              );
              if (existingCodeCell) {
                if (DEBUG)
                  console.log(`Code cell at ${index}: keep existing ${existingCodeCell.id}`);
                return existingCodeCell; // Keep code cell intact
              } else {
                if (DEBUG) console.log(`Code cell at ${index}: new code cell ${newCell.id}`);
                return newCell; // New code block
              }
            } else if (newCell.type === 'markdown') {
              // Reuse existing markdown cell id/metadata when possible to keep store in sync
              const existingMarkdownCell = currentCells[index];
              if (existingMarkdownCell && existingMarkdownCell.type === 'markdown') {
                return {
                  ...existingMarkdownCell,
                  content: newCell.content, // update content only
                };
              }
              return newCell;
            } else {
              // Keep other cell types as is
              const existingSpecialCell = currentCells.find((cell: Cell) => cell.id === newCell.id);
              return existingSpecialCell || newCell;
            }
          });

          if (DEBUG) {
            console.log(
              '合并后cells:',
              mergedCells.map((c, i) => ({ index: i, id: c.id, type: c.type }))
            );
            console.log('===============================================');
          }

          setCells(mergedCells);
          setTimeout(() => {
            isInternalUpdate.current = false;
          }, 50);
        } else if (markdownDiffs.length > 0) {
          // Only Markdown content change, no structural change
          isInternalUpdate.current = true;
          try {
            const storeStateNow = useStore.getState();
            if (storeStateNow?.updateCell) {
              markdownDiffs.forEach(({ id, content }) => {
                storeStateNow.updateCell(id, content);
              });
            }
          } catch (storeError) {
            console.warn('Store access failed in updating markdown:', storeError);
          }
          setTimeout(() => {
            isInternalUpdate.current = false;
          }, 10);
        }
      }, debounceTime);
    } catch (error) {
      console.warn('TipTap onUpdate error:', error);
    }
  };

  const onBlur = ({ editor }: EditorEvents['blur']) => {
    try {
      if (!editor) return;

      // Force immediate sync when editor loses focus
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }

      // Immediately sync state to ensure auto-save triggers
      const newCells = convertEditorStateToCells(editor);
      if (JSON.stringify(newCells) !== JSON.stringify(cells)) {
        console.log('📝 TipTap onBlur: Force syncing state for immediate auto-save');
        isInternalUpdate.current = true;
        setCells(newCells);
        setTimeout(() => {
          isInternalUpdate.current = false;
        }, 10);
      }
    } catch (error) {
      console.warn('TipTap onBlur error:', error);
    }
  };

  return {
    onCreate,
    onDestroy,
    onTransaction,
    onUpdate,
    onBlur,
  };
}
