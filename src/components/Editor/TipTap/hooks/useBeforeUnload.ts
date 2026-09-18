/**
 * Before Unload Hook
 * Handles emergency save when page is about to unload
 */

import { useEffect } from 'react';
import { Editor } from '@tiptap/react';
import type { Cell } from '@Store/models';
import { convertEditorStateToCells } from '@Editor/utils/cellConverters';
import useStore from '@Store/notebookStore';

interface UseBeforeUnloadProps {
  editor: Editor | null;
  cells: Cell[];
  setCells: (cells: Cell[]) => void;
  isInternalUpdate: React.MutableRefObject<boolean>;
  syncTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useBeforeUnload({
  editor,
  cells,
  setCells,
  isInternalUpdate,
  syncTimeoutRef,
}: UseBeforeUnloadProps) {
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear any pending debounced updates
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }

      // Force immediate final save if editor exists and has unsaved changes
      // Add comprehensive safety checks to prevent uninitialized variable access
      if (
        editor &&
        isInternalUpdate?.current !== undefined &&
        typeof isInternalUpdate.current === 'boolean' &&
        !isInternalUpdate.current
      ) {
        try {
          const finalCells = convertEditorStateToCells(editor);
          if (finalCells && JSON.stringify(finalCells) !== JSON.stringify(cells)) {
            console.log('📝 Page unload: Emergency sync for auto-save');
            setCells(finalCells);

            // Force immediate auto-save instead of queueing
            try {
              const storeState = useStore.getState();
              if (storeState?.notebookId) {
                const notebookId = storeState.notebookId;
                const notebookTitle = storeState.notebookTitle;
                const tasks = storeState.tasks;
                import('@Services/autoSave').then(({ AutoSaveService }) => {
                  const autoSave = AutoSaveService.getInstance();
                  autoSave
                    .saveNow({
                      notebookId,
                      notebookTitle: notebookTitle || 'Untitled',
                      cells: finalCells,
                      tasks: tasks || [],
                      timestamp: Date.now(),
                    })
                    .catch(console.error);
                });
              }
            } catch (storeError) {
              console.warn('Store access failed during beforeunload (safe to ignore):', storeError);
            }
          }
        } catch (error) {
          console.warn('Error during beforeunload save:', error);
        }
      }
    };

    // Add listener only after isInternalUpdate is properly initialized
    const timer = setTimeout(() => {
      if (isInternalUpdate.current !== undefined) {
        window.addEventListener('beforeunload', handleBeforeUnload);
      }
    }, 100); // Small delay to ensure initialization

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [editor, cells, setCells, isInternalUpdate, syncTimeoutRef]);
}
