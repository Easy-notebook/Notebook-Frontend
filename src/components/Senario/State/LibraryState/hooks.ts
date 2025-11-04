// LibraryState/hooks.ts
// Custom hooks for LibraryState functionality

import { useState, useEffect, useCallback, useMemo } from 'react';
import { NotebookORM, FileORM, StorageManager, FileCache } from '@Storage/index';
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

  const loadNotebooks = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🚀 Starting notebook loading process...');
      
      // Ensure storage system is initialized with timeout
      try {
        const initTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Storage initialization timeout')), 8000)
        );
        await Promise.race([StorageManager.initialize(), initTimeout]);
        console.log('✅ Storage manager initialized');
      } catch (initError) {
        console.warn('🔄 Storage manager initialization failed, proceeding with fallback:', initError);
        // Continue anyway, let individual systems handle the failure
      }
      
      // Try new storage system first
      let allNotebooks = [];
      try {
        console.log('📚 Attempting to load notebooks from new storage system...');
        const notebookTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('New storage system timeout')), 3000)
        );
        allNotebooks = await Promise.race([
          NotebookORM.getNotebooks({ orderBy: 'lastAccessedAt' }),
          notebookTimeout
        ]);
        console.log(`✅ Loaded ${allNotebooks.length} notebooks from new storage system`);
        console.log('Raw notebooks data:', allNotebooks.map(nb => ({ id: nb.id, name: nb.name })));
      } catch (error) {
        console.warn('❌ New storage system failed, trying legacy system:', error);
        // Fallback to legacy system
        try {
          console.log('📚 Attempting to load notebooks from legacy system...');
          const legacyTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Legacy storage system timeout')), 2000)
          );
          allNotebooks = await Promise.race([
            FileCache.getAllNotebooks(),
            legacyTimeout
          ]);
          console.log(`✅ Loaded ${allNotebooks.length} notebooks from legacy system`);
          console.log('Legacy notebooks data:', allNotebooks.map(nb => ({ id: nb.id, name: nb.name })));
        } catch (legacyError) {
          console.error('❌ Both storage systems failed:', legacyError);
          console.log('🔄 Proceeding with empty state (this is normal for new users)');
          setNotebooks([]);
          setLoading(false);
          return;
        }
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
      
      allNotebooks.forEach(notebook => {
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
          const existingCount = allNotebooks.slice(0, index).filter(n => n.id === notebook.id).length;
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
              originalId: notebook.id?.slice(0, 8)
            });
            
            let lastOpenedFiles: string[] = [];
            let displayName: string | undefined = notebook.name;

            // Try new storage system first for files
            try {
              const files = await FileORM.getFilesForNotebook(notebook.id, false);
              lastOpenedFiles = files
                .slice(0, CONSTANTS.MAX_VISIBLE_FILES)
                .map((f) => f.metadata.fileName);
            } catch (newFileError) {
              // Fallback to legacy system for files
              try {
                const files = await FileCache.getFilesForNotebook(notebook.id);
                lastOpenedFiles = files
                  .slice(0, CONSTANTS.MAX_VISIBLE_FILES)
                  .map((f: { name: string }) => f.name);
              } catch (legacyFileError) {
                console.warn(`Failed to load files for notebook ${notebook.id}:`, legacyFileError);
                lastOpenedFiles = [];
              }
            }

            // Try to read main notebook file for accurate title
            try {
              const main = await FileORM.getFile(notebook.id, `notebook_${notebook.id}.json`);
              const raw = main?.content;
              if (raw) {
                let text = '';
                if (typeof raw === 'string') text = raw;
                else if (raw instanceof Blob) text = await raw.text();
                // Some storage stacks may have been saved as base64; try to decode if JSON.parse fails later
                let data: any = null;
                try {
                  data = JSON.parse(text);
                } catch {
                  // try base64 decoding
                  try {
                    const decoded = atob(text);
                    data = JSON.parse(decoded);
                  } catch {}
                }
                if (data) {
                  console.log(`Raw notebook data structure for ${notebook.id}:`, {
                    keys: Object.keys(data),
                    title: data.title,
                    notebook_title: data.notebook_title,
                    notebookTitle: data.notebookTitle,
                    meta: data.meta,
                    cells: data.cells ? `Array(${data.cells.length})` : 'undefined',
                    firstCell: data.cells?.[0] ? {
                      type: data.cells[0].cell_type || data.cells[0].cellType,
                      keys: Object.keys(data.cells[0]),
                      source: data.cells[0].source || data.cells[0].content,
                      sourcePreview: typeof (data.cells[0].source || data.cells[0].content) === 'string' 
                        ? (data.cells[0].source || data.cells[0].content).substring(0, 100) 
                        : data.cells[0].source || data.cells[0].content
                    } : 'no cells',
                    allCellsPreview: data.cells ? data.cells.slice(0, 3).map((cell, idx) => ({
                      index: idx,
                      type: cell.cell_type || cell.cellType,
                      sourcePreview: typeof (cell.source || cell.content) === 'string' 
                        ? (cell.source || cell.content).substring(0, 50) 
                        : cell.source || cell.content
                    })) : 'no cells'
                  });
                  
                  // Skip the corrupted title field and extract from cells directly
                  let extractedTitle = '';
                  
                  // Try to extract from cells (notebook structure) first
                  if (data.cells && Array.isArray(data.cells)) {
                    // Look for first cell with markdown content containing h1
                    for (const cell of data.cells) {
                      if (cell.cell_type === 'markdown' || cell.cellType === 'markdown') {
                        const source = cell.source || cell.content || '';
                        const sourceText = Array.isArray(source) ? source.join('') : source;
                        
                        // Extract h1 from markdown (# Title or ## Title etc)
                        const h1Match = sourceText.match(/^#\s+(.+)$/m);
                        if (h1Match) {
                          extractedTitle = h1Match[1].trim();
                          break;
                        }
                      }
                    }
                  }
                  
                  // If still no title, try to extract from first text cell
                  if (!extractedTitle && data.cells && Array.isArray(data.cells)) {
                    for (const cell of data.cells) {
                      const source = cell.source || cell.content || '';
                      const sourceText = Array.isArray(source) ? source.join('') : source;
                      if (sourceText && sourceText.trim()) {
                        // Take first non-empty line, limit to 50 characters
                        const firstLine = sourceText.trim().split('\n')[0];
                        if (firstLine) {
                          extractedTitle = firstLine.replace(/^#+\s*/, '').trim().substring(0, 50);
                          break;
                        }
                      }
                    }
                  }
                  
                  // If still no title found, use fallback but make it unique per notebook
                  if (!extractedTitle) {
                    // Use notebook-specific fallback based on unique ID
                    extractedTitle = `Notebook ${notebook.id.slice(0, 8)}`;
                  }
                  
                  if (extractedTitle && typeof extractedTitle === 'string') {
                    displayName = extractedTitle;
                    console.log(`Extracted title for ${notebook.id}:`, extractedTitle);
                  }
                }
              }
            } catch (e) {
              console.warn(`Failed to parse notebook content for ${notebook.id}:`, e);
            }

            const finalName = displayName || notebook.name || `Notebook ${notebook.id?.slice(0, 8) || 'Unknown'}`;
            console.log(`Final processed notebook:`, { id: notebook.id, finalName, originalName: notebook.name, displayName });
            
            return {
              ...notebook,
              name: finalName,
              lastOpenedFiles,
              isStarred: false, // TODO: Implement starring functionality
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
  }, []);

  const refreshNotebooks = useCallback(async () => {
    setRefreshing(true);
    await loadNotebooks();
    setRefreshing(false);
  }, [loadNotebooks]);

  const deleteNotebook = useCallback(async (notebookId: string) => {
    try {
      console.log(`🗑️ Starting deletion of notebook ${notebookId}`);
      
      // Try new storage system first
      try {
        await NotebookORM.deleteNotebook(notebookId);
        console.log(`✅ Successfully deleted notebook ${notebookId} from new storage system`);
        
        // Update state immediately for better UX
        setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
        
        // Clear any cached data related to this notebook
        try {
          const { default: usePreviewStore } = await import('@Store/previewStore');
          const previewStore = usePreviewStore.getState();
          if (previewStore.getCurrentNotebookId() === notebookId) {
            previewStore.set?.({ 
              currentPreviewFiles: [], 
              activeFile: null, 
              activePreviewMode: null 
            });
            console.log(`🧹 Cleared preview store for deleted notebook ${notebookId}`);
          }
        } catch (previewError) {
          console.warn('Failed to clear preview store:', previewError);
        }
        
        return true;
      } catch (newSystemError) {
        console.warn('New storage system delete failed, trying legacy:', newSystemError);
        // Fallback to legacy system
        await FileCache.clearNotebookCache(notebookId);
        console.log(`✅ Successfully deleted notebook ${notebookId} from legacy system`);
        
        setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
        return true;
      }
    } catch (error) {
      console.error(`❌ Failed to delete notebook ${notebookId}:`, error);
      return false;
    }
  }, []);

  const toggleStar = useCallback((notebookId: string) => {
    setNotebooks((prev) =>
      prev.map((nb) => 
        nb.id === notebookId ? { ...nb, isStarred: !nb.isStarred } : nb
      )
    );
    // TODO: Persist starring to storage
  }, []);

  const batchDeleteNotebooks = useCallback(async (notebookIds: string[]) => {
    console.log(`🗑️ Starting batch deletion of ${notebookIds.length} notebooks`);
    
    const results = await Promise.allSettled(
      notebookIds.map(id => deleteNotebook(id))
    );
    
    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length;
    
    console.log(`✅ Batch delete completed: ${successful}/${notebookIds.length} successful`);
    return { successful, total: notebookIds.length };
  }, [deleteNotebook]);

  const exportNotebook = useCallback(async (notebookId: string) => {
    try {
      console.log(`📤 Exporting notebook ${notebookId}`);
      
      const notebook = notebooks.find(n => n.id === notebookId);
      if (!notebook) {
        throw new Error('Notebook not found');
      }

      const main = await FileORM.getFile(notebookId, `notebook_${notebookId}.json`);
      if (!main?.content) {
        throw new Error('Notebook content not found');
      }

      const title = notebook.name || `Notebook ${notebookId.slice(0,8)}`;
      const blob = new Blob([main.content as string], { 
        type: 'application/json;charset=utf-8' 
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
  }, [notebooks]);

  const batchExportNotebooks = useCallback(async (notebookIds: string[]) => {
    console.log(`📤 Starting batch export of ${notebookIds.length} notebooks`);
    
    const results = await Promise.allSettled(
      notebookIds.map(id => exportNotebook(id))
    );
    
    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length;
    
    console.log(`✅ Batch export completed: ${successful}/${notebookIds.length} successful`);
    return { successful, total: notebookIds.length };
  }, [exportNotebook]);

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
      filtered = notebooks.filter((nb) =>
        nb.name?.toLowerCase().includes(query) ||
        nb.description?.toLowerCase().includes(query) ||
        nb.lastOpenedFiles?.some(file => 
          file.toLowerCase().includes(query)
        )
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