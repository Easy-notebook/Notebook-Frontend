// moved to sections/LeftSideBar/Main/Empty/hooks.ts
// Custom hooks for EmptySidebar functionality

import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';
import { usePersistence } from '../../../../../../services/persistence/PersistenceContext';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { navigateToWorkspace } from '@Utils/navigation';
import type { CachedNotebook } from './types';

/**
 * Hook for managing notebook data with proper storage integration
 * Based on LibraryState implementation
 */
export const useNotebooks = () => {
  const [notebooks, setNotebooks] = useState<CachedNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
  const persistence = usePersistence();

  const loadNotebooks = useCallback(async () => {
    try {
      setLoading(true);

      // Use new persistence service
      const allNotebooks = await persistence.notebooks.getAllNotebooks({
        orderBy: 'lastAccessedAt',
        limit: 20,
      });

      // Transform to CachedNotebook format
      const cachedNotebooks: CachedNotebook[] = allNotebooks.map((nb: any) => ({
        id: nb.id,
        name: nb.name || nb.title || 'Untitled',
        title: nb.name || nb.title || 'Untitled',
        description: nb.description || '',
        createdAt: nb.createdAt || Date.now(),
        updatedAt: nb.updatedAt || Date.now(),
        lastAccessedAt: nb.lastAccessedAt || nb.updatedAt || Date.now(),
        accessCount: nb.accessCount || 0,
        fileCount: nb.fileCount || nb.cellCount || 0,
        totalSize: nb.totalSize || nb.size || 0,
        cacheEnabled: nb.cacheEnabled ?? true,
        maxCacheSize: nb.maxCacheSize,
        isStarred: nb.isStarred || false,
        cellCount: nb.cellCount || 0,
        version: nb.version || '1.0.0',
      }));

      setNotebooks(cachedNotebooks);
    } catch (error) {
      console.error('❌ Error loading notebooks for sidebar:', error);
      setNotebooks([]);
      message.error('Failed to load notebook history');
    } finally {
      setLoading(false);
    }
  }, [persistence]);

  // Initial load
  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  // Refresh notebooks
  const refreshNotebooks = useCallback(async () => {
    setRefreshing(true);
    await loadNotebooks();
    setRefreshing(false);
  }, [loadNotebooks]);

  // Create new notebook
  const createNotebook = useCallback(async () => {
    if (isCreatingNotebook) return;

    setIsCreatingNotebook(true);
    try {
      const response = await NotebookLifecycleService.initializeNotebook();
      const newNotebookId = response.notebook_id;

      if (!newNotebookId) {
        throw new Error('No notebook ID returned from server');
      }

      // Initialize store with new notebook state directly
      // This ensures isLoaded is true before navigation
      const defaultCell = {
        id: `title-${Date.now()}`,
        type: 'markdown' as const,
        content: '# Untitled',
        outputs: [],
        enableEdit: true,
        phaseId: null,
        description: null,
        metadata: { isDefaultTitle: true },
      };

      useStore.setState({
        notebookId: newNotebookId,
        notebookTitle: 'Untitled',
        cells: [defaultCell],
        tasks: [],
        isInitialized: true,
        isLoaded: true,
        currentCellId: defaultCell.id,
        currentPhaseId: null,
        currentStepIndex: 0,
        error: null,
      });

      useCodeStore.getState().setKernelReady(true);

      // Navigate to the new notebook
      navigateToWorkspace(newNotebookId);

      // Refresh notebook list to include the new one
      setTimeout(() => {
        loadNotebooks();
      }, 1000);
    } catch (error) {
      console.error('❌ Failed to create new notebook:', error);
      message.error('Failed to create notebook');
    } finally {
      setIsCreatingNotebook(false);
    }
  }, [isCreatingNotebook, loadNotebooks]);

  // Toggle star
  const toggleStar = useCallback(
    async (notebookId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      try {
        // Update local state optimistically
        setNotebooks((prev) =>
          prev.map((nb) => (nb.id === notebookId ? { ...nb, isStarred: !nb.isStarred } : nb))
        );

        // Persistence not supported in current ORM schema; keep optimistic update
      } catch (error) {
        console.error('Failed to toggle star:', error);
        // Revert optimistic update
        setNotebooks((prev) =>
          prev.map((nb) => (nb.id === notebookId ? { ...nb, isStarred: !nb.isStarred } : nb))
        );
      }
    },
    [] // notebooks is not needed - we use setNotebooks function form
  );

  // Delete notebook (if needed in the future)
  const deleteNotebook = useCallback(
    async (notebookId: string) => {
      try {
        // Remove from storage
        await persistence.notebooks.deleteNotebook(notebookId);

        // Update local state
        setNotebooks((prev) => prev.filter((nb) => nb.id !== notebookId));
      } catch (error) {
        console.error('Failed to delete notebook:', error);
        message.error('Failed to delete notebook');
      }
    },
    [persistence]
  );

  return {
    notebooks,
    loading,
    refreshing,
    isCreatingNotebook,
    loadNotebooks,
    refreshNotebooks,
    createNotebook,
    toggleStar,
    deleteNotebook,
  };
};
