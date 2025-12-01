/**
 * Editor Events Hook
 * Handles TipTap editor lifecycle events (onCreate, onUpdate, onBlur, onDestroy, onTransaction)
 */

import { Editor, EditorEvents } from '@tiptap/react';
import React from 'react';
import type { Cell } from '@Store/models';
import { convertEditorStateToCells } from '@Editor/utils/cellConverters';
import useStore from '@Store/notebookStore';
import enLocale from '../../../../i18n/locales/en.json';
import zhLocale from '../../../../i18n/locales/zh.json';

const DEBUG = true;
const DEBOUNCE_TIME = 50;
const SYNC_LOCK_MS = 50;
const FORCE_SYNC_DELAY = 10;

interface UseEditorEventsProps {
  cells: Cell[];
  setCells: (cells: Cell[]) => void;
  isInternalUpdate: React.MutableRefObject<boolean>;
  syncTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastInsertedCodeCellIdRef: React.MutableRefObject<string | null>;
  setCurrentEditor: (editor: Editor | null) => void;
  editorRef: React.MutableRefObject<Editor | null>;
  defaultTitle: string;
}

export function useEditorEvents({
  cells,
  setCells,
  isInternalUpdate,
  syncTimeoutRef,
  lastInsertedCodeCellIdRef,
  setCurrentEditor,
  editorRef,
  defaultTitle,
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

  // Helper to merge new cells with existing store cells to preserve outputs
  const mergeCellsWithStore = (newCells: Cell[], currentCells: Cell[]) => {
    return newCells.map((newCell, _index) => {
      if (newCell.type === 'code') {
        // For code cells always keep existing store data to preserve outputs
        const existingCodeCell = currentCells.find(
          (cell) => cell.type === 'code' && cell.id === newCell.id
        );
        if (existingCodeCell) {
          return existingCodeCell;
        }
        return newCell;
      } else if (newCell.type === 'markdown') {
        // Reuse existing markdown cell id/metadata when possible
        const existingMarkdownCell = currentCells.find(
          (c) => c.id === newCell.id && c.type === 'markdown'
        );
        if (existingMarkdownCell) {
          return { ...existingMarkdownCell, content: newCell.content };
        }
        return newCell;
      }
      // Keep other cell types as is
      const existingSpecialCell = currentCells.find((cell) => cell.id === newCell.id);
      return existingSpecialCell || newCell;
    });
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
        const newCellsRaw = convertEditorStateToCells(editorInstance);
        if (newCellsRaw && setCells && typeof setCells === 'function' && cells) {
          // Apply smart merge
          let currentCells = cells;
          try {
            const storeState = useStore.getState();
            if (storeState?.cells) currentCells = storeState.cells;
          } catch {
            /* ignore store access errors during unmount */
          }

          const mergedCells = mergeCellsWithStore(newCellsRaw, currentCells);

          if (JSON.stringify(mergedCells) !== JSON.stringify(cells)) {
            console.log('📝 TipTap onDestroy: Final force sync for auto-save');
            setCells(mergedCells);
          }
        }
      }
    } catch (error) {
      console.warn('TipTap onDestroy error (safe to ignore during unmount):', error);
    }
  };

  // Use ref for defaultTitle to ensure fresh value in callbacks
  const defaultTitleRef = React.useRef(defaultTitle);

  // Handle dynamic title translation when language changes
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;

    const firstNode = editor.state.doc.firstChild;
    if (firstNode && firstNode.type.name === 'title') {
      const currentContent = firstNode.textContent;
      const knownDefaults = [
        enLocale.common.untitled,
        zhLocale.common.untitled,
        'Untitled', // Fallback
        '未命名', // Fallback
      ];

      // If current title is one of the known defaults (e.g. "Untitled")
      // and it doesn't match the NEW default title (e.g. "未命名"), update it.
      if (knownDefaults.includes(currentContent) && currentContent !== defaultTitle) {
        // Use command to update title
        editor.commands.command(({ tr }) => {
          tr.insertText(defaultTitle, 1, firstNode.nodeSize - 1);
          return true;
        });
      }
    }

    defaultTitleRef.current = defaultTitle;
  }, [defaultTitle]);

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

      // Handle default title focus behavior: Cursor to start if content matches default title
      const { selection } = transaction;
      const { doc } = transaction;
      const firstNode = doc.firstChild;

      // Check if we are selecting the title
      if (
        firstNode &&
        firstNode.type.name === 'title' &&
        firstNode.textContent === defaultTitleRef.current
      ) {
        // If cursor is NOT at start (pos 1), force it to start
        // We allow pos 0? No, pos 1 is start of content.
        // If selection is range, we also force collapse to start.
        if (selection.from !== 1 || selection.to !== 1) {
          // We can't modify the transaction here easily without side effects or loops.
          // Better to use a microtask to dispatch a new selection command.
          Promise.resolve().then(() => {
            if (editor.isDestroyed) return;
            // Cursor to start
            editor.commands.setTextSelection(1);
          });
        }
      }
    } catch (error) {
      console.warn('TipTap onTransaction error:', error);
    }
  };

  // Track previous title to detect input into default title
  const prevTitleRef = React.useRef<string>('');

  const onUpdate = ({ editor }: EditorEvents['update']) => {
    try {
      if (!editor || isInternalUpdate.current) return;

      const firstNode = editor.state.doc.firstChild;
      const currentTitle =
        firstNode && firstNode.type.name === 'title' ? firstNode.textContent : '';

      // Check if title is empty and revert to default if so
      if (firstNode && firstNode.type.name === 'title' && firstNode.textContent.length === 0) {
        // Use a microtask to avoid updating during render/update cycle
        Promise.resolve().then(() => {
          if (editor.isDestroyed) return;

          // Only update if it's still empty (double check)
          const currentFirstNode = editor.state.doc.firstChild;
          if (
            currentFirstNode &&
            currentFirstNode.type.name === 'title' &&
            currentFirstNode.textContent.length === 0
          ) {
            editor.commands.command(({ tr }) => {
              tr.insertText(defaultTitleRef.current, 1);
              return true;
            });
          }
        });
      } else if (
        firstNode &&
        firstNode.type.name === 'title' &&
        prevTitleRef.current === defaultTitleRef.current &&
        currentTitle !== defaultTitleRef.current &&
        currentTitle.includes(defaultTitleRef.current)
      ) {
        // User typed into default title -> remove default title part
        // Example: "AUntitled" -> "A"
        const newTitle = currentTitle.replace(defaultTitleRef.current, '');

        // Apply change
        Promise.resolve().then(() => {
          if (editor.isDestroyed) return;
          editor.commands.command(({ tr }) => {
            // Replace the whole title content
            // Title node is at pos 0. Content starts at 1.
            // We want to replace from 1 to nodeSize-1
            tr.insertText(newTitle, 1, firstNode.nodeSize - 1);
            return true;
          });
        });
      }

      // Update prev title ref
      prevTitleRef.current = currentTitle;

      // Reduce debounce time, improve real-time save responsiveness
      const debounceTime = DEBOUNCE_TIME;

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

          const mergedCells = mergeCellsWithStore(newCells, currentCells);

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
          }, SYNC_LOCK_MS);
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
          }, FORCE_SYNC_DELAY);
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
      const newCellsRaw = convertEditorStateToCells(editor);

      // Apply smart merge
      let currentCells = cells;
      try {
        const storeState = useStore.getState();
        if (storeState?.cells) currentCells = storeState.cells;
      } catch {
        /* ignore store access errors during blur */
      }

      const mergedCells = mergeCellsWithStore(newCellsRaw, currentCells);

      if (JSON.stringify(mergedCells) !== JSON.stringify(cells)) {
        console.log('📝 TipTap onBlur: Force syncing state for immediate auto-save');
        isInternalUpdate.current = true;
        setCells(mergedCells);
        setTimeout(() => {
          isInternalUpdate.current = false;
        }, FORCE_SYNC_DELAY);
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
