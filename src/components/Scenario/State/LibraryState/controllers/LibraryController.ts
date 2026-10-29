import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePersistence } from '../../../../../services/persistence/PersistenceContext';
import { LibraryService } from '../services/LibraryService';
import { CachedNotebook, SortBy, CONSTANTS } from '../types';
import { useDebounce } from '../utils';
import { notificationService } from '../../../../../services/notificationService';
import { NotebookLifecycleService } from '../../../../../services/notebook/NotebookLifecycleService';

export const useLibraryController = (props?: {
  onSelectNotebook?: (id: string, name: string) => void;
}) => {
  // Services
  const persistence = usePersistence();
  const service = useMemo(() => new LibraryService(persistence), [persistence]);

  // State
  const [notebooks, setNotebooks] = useState<CachedNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Actions
  const loadNotebooks = useCallback(async () => {
    setLoading(true);
    const data = await service.loadNotebooks();
    setNotebooks(data);
    setLoading(false);
    return data;
  }, [service]);

  const refreshNotebooks = useCallback(async () => {
    setRefreshing(true);
    const data = await service.loadNotebooks();
    setNotebooks(data);
    setRefreshing(false);
    return data;
  }, [service]);

  const handleDeleteNotebook = useCallback(async () => {
    if (selectedNotebook) {
      const success = await service.deleteNotebook(selectedNotebook);
      if (success) {
        setNotebooks((prev) => prev.filter((n) => n.id !== selectedNotebook));
        notificationService.success('Success', '笔记本已成功删除');
        setShowDeleteModal(false);
        setSelectedNotebook(null);
      } else {
        notificationService.error('Error', '删除笔记本失败，请重试');
      }
    }
  }, [selectedNotebook, service]);

  const handleExportNotebook = useCallback(
    async (notebookId: string) => {
      try {
        await service.exportNotebook(notebookId, notebooks);
        notificationService.success('Success', '笔记本导出成功');
      } catch {
        notificationService.error('Error', '导出失败');
      }
    },
    [service, notebooks]
  );

  const handleSelectNotebook = useCallback(
    async (notebookId: string, onSelect?: (id: string, name: string) => void) => {
      const notebook = notebooks.find((n) => n.id === notebookId);
      if (!notebook) return;
      const callback = onSelect || props?.onSelectNotebook;
      callback?.(notebookId, notebook.name || `Notebook ${notebookId.slice(0, 8)}`);
    },
    [service, notebooks, props?.onSelectNotebook]
  );

  const updateLibrary = useCallback(
    async (id: string, patch: NonNullable<CachedNotebook['library']>) => {
      try {
        await persistence.notebooks.updateLibraryMetadata(id, patch);
        setNotebooks((prev) =>
          prev.map((nb) =>
            nb.id === id
              ? {
                  ...nb,
                  library: { ...nb.library, ...patch },
                  isStarred: patch.isStarred ?? nb.isStarred,
                  presentation: nb.presentation && {
                    ...nb.presentation,
                    kind: patch.kind ?? nb.presentation.kind,
                  },
                }
              : nb
          )
        );
      } catch {
        notificationService.error('保存失败', '资料库设置未保存，请重试');
        throw new Error('Unable to save library preferences');
      }
    },
    [persistence]
  );
  const handleToggleStar = useCallback(
    (id: string) => {
      const item = notebooks.find((nb) => nb.id === id);
      void updateLibrary(id, { isStarred: !item?.isStarred }).catch(() => {});
    },
    [notebooks, updateLibrary]
  );

  const openDeleteModal = useCallback((notebookId: string) => {
    setSelectedNotebook(notebookId);
    setShowDeleteModal(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setSelectedNotebook(null);
    setShowDeleteModal(false);
  }, []);

  // Filtering Logic
  const debouncedSearchQuery = useDebounce(searchQuery, CONSTANTS.DEBOUNCE_DELAY);

  const filteredNotebooks = useMemo(() => {
    let filtered = notebooks;

    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = notebooks.filter(
        (nb) =>
          nb.name?.toLowerCase().includes(query) ||
          nb.description?.toLowerCase().includes(query) ||
          nb.presentation?.preview.toLowerCase().includes(query) ||
          nb.presentation?.providers.some((provider) =>
            (provider === 'claude' ? 'claude code' : 'openai codex').includes(query)
          ) ||
          nb.lastOpenedFiles?.some((file) => file.toLowerCase().includes(query))
      );
    }

    return [...filtered].sort((a, b) => {
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
  }, [notebooks, debouncedSearchQuery, sortBy]);

  // Initial Load
  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  const onSelectNotebook = props?.onSelectNotebook;
  const handleCreateNotebook = useCallback(async () => {
    try {
      // 1. Create notebook
      const response = await NotebookLifecycleService.initializeNotebook();
      const newNotebookId = response.notebook_id;
      if (!newNotebookId) throw new Error('Failed to get notebook ID');

      // The route owns loading the saved document and discovering its files.
      onSelectNotebook?.(newNotebookId, 'Untitled');

      notificationService.success('Success', 'New notebook created');
    } catch (err) {
      console.error('Failed to create notebook:', err);
      notificationService.error('Error', 'Failed to create notebook');
    }
  }, [loadNotebooks, service, onSelectNotebook, persistence]);

  return {
    // State
    notebooks: filteredNotebooks,
    loading,
    refreshing,
    searchQuery,
    viewMode,
    sortBy,
    selectedNotebook,
    showDeleteModal,
    selectedNotebookData: notebooks.find((n) => n.id === selectedNotebook),

    // Setters
    setSearchQuery,
    setViewMode,
    setSortBy,

    // Actions
    refreshNotebooks,
    handleDeleteNotebook,
    handleExportNotebook,
    handleSelectNotebook,
    handleCreateNotebook,
    handleToggleStar,
    updateLibrary,
    openDeleteModal,
    closeDeleteModal,
  };
};
