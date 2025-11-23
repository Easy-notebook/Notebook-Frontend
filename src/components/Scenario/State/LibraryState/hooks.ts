// LibraryState/hooks.ts
// Custom hooks for LibraryState functionality

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePersistence } from '../../../../services/persistence/PersistenceContext';
import type { NotebookEntity } from '../../../../services/persistence/interfaces';
import { useDebounce } from './utils';
import type { CachedNotebook, SortBy } from './types';
import { CONSTANTS } from './types';

/**
 * Hook for managing notebook data with proper storage integration
 */
export const useNotebooks = () => {
  const [notebooks, setNotebooks] = useState<CachedNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const persistence = usePersistence();

  const loadNotebooks = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🚀 Starting notebook loading process...');

      // Use new persistence service
      let allNotebooks: NotebookEntity[] = [];
      try {
        console.log('📚 Attempting to load notebooks from new storage system...');
        allNotebooks = await persistence.notebooks.getAllNotebooks({ orderBy: 'lastAccessedAt' });
        console.log(`✅ Loaded ${allNotebooks.length} notebooks from new storage system`);
      } catch (error) {
        console.error('❌ New storage system failed:', error);
        setNotebooks([]);
        setLoading(false);
        return;
      }

      if (allNotebooks.length === 0) {
        console.log('No notebooks found in storage');
        setNotebooks([]);
        setLoading(false);
        return;
      }

      // Check for duplicate IDs and fix them
      const seenIds = new Set<string>();
      const duplicateIds: string[] = [];

      allNotebooks.forEach((notebook) => {
        if (seenIds.has(notebook.id)) {
          duplicateIds.push(notebook.id);
        } else {
          seenIds.add(notebook.id);
        }
      });

      if (duplicateIds.length > 0) {
        console.warn('Found duplicate notebook IDs:', duplicateIds);
        // Generate unique IDs for duplicates
        allNotebooks = allNotebooks.map((notebook, index) => {
          const existingCount = allNotebooks
            .slice(0, index)
            .filter((n) => n.id === notebook.id).length;
          if (existingCount > 0) {
            // This is a duplicate, generate a new ID
            const newId = `${notebook.id}_dup_${existingCount}`;
            console.log(`Renaming duplicate notebook ${notebook.id} to ${newId}`);
            return { ...notebook, id: newId };
          }
          return notebook;
        });
      }

      // Enrich notebooks with additional data
      const enrichedNotebooks = await Promise.all(
        allNotebooks.map(async (notebook) => {
          try {
            console.log(`Processing notebook:`, {
              id: notebook.id,
              name: notebook.name,
              originalId: notebook.id?.slice(0, 8),
            });

            let lastOpenedFiles: string[] = [];
            let displayName: string | undefined = notebook.name;

            // Get files
            try {
              const files = await persistence.files.getFilesForNotebook(notebook.id, false);
              lastOpenedFiles = files
                .slice(0, CONSTANTS.MAX_VISIBLE_FILES)
                .map((f) => f.metadata.fileName);
            } catch (fileError) {
              console.warn(`Failed to load files for notebook ${notebook.id}:`, fileError);
              lastOpenedFiles = [];
            }

            // Try to read main notebook file for accurate title
            try {
              const main = await persistence.files.getFile(
                notebook.id,
                `notebook_${notebook.id}.json`
              );
              const raw = main?.content;
              if (raw) {
                let text = '';
                if (typeof raw === 'string') text = raw;
                // Blob handling removed as new service returns string

                let data: any = null;
                try {
                  data = JSON.parse(text);
                } catch {
                  // Ignore JSON parse errors
                }

                if (data) {
                  // Extract title logic (simplified from original)
                  let extractedTitle = data.title || data.notebookTitle;

                  if (!extractedTitle && data.cells && Array.isArray(data.cells)) {
                    // Try to extract from cells (simplified)
                    for (const cell of data.cells) {
                      if (cell.cell_type === 'markdown' || cell.cellType === 'markdown') {
                        const source = cell.source || cell.content || '';
                        const sourceText = Array.isArray(source) ? source.join('') : source;
                        const h1Match = sourceText.match(/^#\s+(.+)$/m);
                        if (h1Match) {
                          extractedTitle = h1Match[1].trim();
                          break;
                        }
                      }
                    }
                  }

                  if (!extractedTitle) {
                    extractedTitle = `Notebook ${notebook.id.slice(0, 8)}`;
                  }

                  if (extractedTitle && typeof extractedTitle === 'string') {
                    displayName = extractedTitle;
                  }
                }
              }
            } catch (e) {
              console.warn(`Failed to parse notebook content for ${notebook.id}:`, e);
            }

            const finalName =
              displayName || notebook.name || `Notebook ${notebook.id?.slice(0, 8) || 'Unknown'}`;

            return {
              ...notebook,
              name: finalName,
              lastOpenedFiles,
              isStarred: false,
            } as CachedNotebook;
          } catch (err) {
            console.warn(`Failed to process notebook ${notebook.id}:`, err);
            return {
              ...notebook,
              name: notebook.name || `Notebook ${notebook.id?.slice(0, 8) || 'Unknown'}`,
              lastOpenedFiles: [],
              isStarred: false,
            } as CachedNotebook;
          }
        })
      );

      setNotebooks(enrichedNotebooks);
      console.log(`Successfully loaded ${enrichedNotebooks.length} enriched notebooks`);
    } catch (error) {
      console.error('Failed to load notebooks:', error);
      setNotebooks([]);
    } finally {
      setLoading(false);
    }
  }, [persistence]);

  const refreshNotebooks = useCallback(async () => {
    setRefreshing(true);
    await loadNotebooks();
    setRefreshing(false);
  }, [loadNotebooks]);

  const deleteNotebook = useCallback(
    async (notebookId: string) => {
      try {
        console.log(`🗑️ Starting deletion of notebook ${notebookId}`);

        await persistence.notebooks.deleteNotebook(notebookId);
        console.log(`✅ Successfully deleted notebook ${notebookId}`);

        // Update state immediately for better UX
        setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));

        // Clear any cached data related to this notebook
        try {
          const { default: usePreviewStore } = await import('@Store/previewStore');
          const previewStore = usePreviewStore.getState();
          if (previewStore.getCurrentNotebookId() === notebookId) {
            previewStore.resetToNotebookMode();
            console.log(`🧹 Cleared preview store for deleted notebook ${notebookId}`);
          }
        } catch (previewError) {
          console.warn('Failed to clear preview store:', previewError);
        }

        return true;
      } catch (error) {
        console.error(`❌ Failed to delete notebook ${notebookId}:`, error);
        return false;
      }
    },
    [persistence]
  );

  const toggleStar = useCallback((notebookId: string) => {
    setNotebooks((prev) =>
      prev.map((nb) => (nb.id === notebookId ? { ...nb, isStarred: !nb.isStarred } : nb))
    );
    // TODO: Persist starring to storage
  }, []);

  const batchDeleteNotebooks = useCallback(
    async (notebookIds: string[]) => {
      console.log(`🗑️ Starting batch deletion of ${notebookIds.length} notebooks`);

      const results = await Promise.allSettled(notebookIds.map((id) => deleteNotebook(id)));

      const successful = results.filter(
        (result) => result.status === 'fulfilled' && result.value === true
      ).length;

      console.log(`✅ Batch delete completed: ${successful}/${notebookIds.length} successful`);
      return { successful, total: notebookIds.length };
    },
    [deleteNotebook]
  );

  const exportNotebook = useCallback(
    async (notebookId: string) => {
      try {
        console.log(`📤 Exporting notebook ${notebookId}`);

        const notebook = notebooks.find((n) => n.id === notebookId);
        if (!notebook) {
          throw new Error('Notebook not found');
        }

        const main = await persistence.files.getFile(notebookId, `notebook_${notebookId}.json`);
        if (!main?.content) {
          throw new Error('Notebook content not found');
        }

        const title = notebook.name || `Notebook ${notebookId.slice(0, 8)}`;
        const blob = new Blob([main.content as string], {
          type: 'application/json;charset=utf-8',
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.easynb`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        console.log(`✅ Successfully exported notebook: ${title}.easynb`);
        return true;
      } catch (error) {
        console.error(`❌ Failed to export notebook ${notebookId}:`, error);
        throw error;
      }
    },
    [notebooks, persistence]
  );

  const batchExportNotebooks = useCallback(
    async (notebookIds: string[]) => {
      console.log(`📤 Starting batch export of ${notebookIds.length} notebooks`);

      const results = await Promise.allSettled(notebookIds.map((id) => exportNotebook(id)));

      const successful = results.filter(
        (result) => result.status === 'fulfilled' && result.value === true
      ).length;

      console.log(`✅ Batch export completed: ${successful}/${notebookIds.length} successful`);
      return { successful, total: notebookIds.length };
    },
    [exportNotebook]
  );

  // Load notebooks on mount
  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  return {
    notebooks,
    loading,
    refreshing,
    loadNotebooks,
    refreshNotebooks,
    deleteNotebook,
    batchDeleteNotebooks,
    exportNotebook,
    batchExportNotebooks,
    toggleStar,
  };
};

/**
 * Hook for filtering and sorting notebooks
 */
export const useNotebookFiltering = (
  notebooks: CachedNotebook[],
  searchQuery: string,
  sortBy: SortBy
) => {
  const debouncedSearchQuery = useDebounce(searchQuery, CONSTANTS.DEBOUNCE_DELAY);

  return useMemo(() => {
    let filtered = notebooks;

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = notebooks.filter(
        (nb) =>
          nb.name?.toLowerCase().includes(query) ||
          nb.description?.toLowerCase().includes(query) ||
          nb.lastOpenedFiles?.some((file) => file.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'size':
          return (b.totalSize || 0) - (a.totalSize || 0);
        case 'files':
          return (b.fileCount || 0) - (a.fileCount || 0);
        case 'recent':
        default:
          return (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0);
      }
    });

    return sorted;
  }, [notebooks, debouncedSearchQuery, sortBy]);
};

/**
 * Hook for managing library state UI
 */
export const useLibraryState = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const openDeleteModal = useCallback((notebookId: string) => {
    setSelectedNotebook(notebookId);
    setShowDeleteModal(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setSelectedNotebook(null);
    setShowDeleteModal(false);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    selectedNotebook,
    showDeleteModal,
    openDeleteModal,
    closeDeleteModal,
  };
};
