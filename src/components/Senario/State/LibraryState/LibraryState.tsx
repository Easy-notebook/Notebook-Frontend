// LibraryState/LibraryState.tsx
// Main LibraryState component - redesigned with proper storage integration

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Modal, message } from 'antd';
import useNotebookStore from '@Store/notebookStore';
import { NotebookORM } from '@Storage/index';
import LibraryHeader from './LibraryHeader';
import NotebookList from './NotebookList';
import SwipeIndicator from './SwipeIndicator';
import StorageCleanupTool from './StorageCleanupTool';
import { useSwipeGesture } from './utils';
import { useNotebooks, useNotebookFiltering, useLibraryState } from './hooks';
import type { LibraryStateProps } from './types';

const LibraryState: React.FC<LibraryStateProps> = ({ onBack, onSelectNotebook }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showCleanupTool, setShowCleanupTool] = useState(false);

  // State management
  const {
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    sortBy,
    selectedNotebook,
    showDeleteModal,
    openDeleteModal,
    closeDeleteModal,
  } = useLibraryState();

  // Notebook data management
  const {
    notebooks,
    loading,
    refreshing,
    refreshNotebooks,
    deleteNotebook,
    exportNotebook,
    toggleStar,
  } = useNotebooks();

  // Filtering and sorting
  const filteredNotebooks = useNotebookFiltering(notebooks, searchQuery, sortBy);

  // Swipe gesture for back navigation
  const { swipeDistance, handlers } = useSwipeGesture(() => onBack?.());

  // Event handlers
  const handleSelectNotebook = useCallback(
    async (notebookId: string) => {
      const notebook = notebooks.find((n) => n.id === notebookId);
      if (notebook) {
        try {
          console.log(`🔄 Loading notebook ${notebookId} from database...`);
          
          // Load notebook content from database
          const store = useNotebookStore.getState();
          const loaded = await store.loadFromDatabase(notebookId);
          
          if (loaded) {            
            // 🏷️ Load tabs for the notebook with proper isolation
            const { default: usePreviewStore } = await import('@Store/previewStore');
            const previewStore = usePreviewStore.getState();
            
            // Clear any existing tabs from other notebooks first
            previewStore.setCurrentPreviewFiles([]);
            previewStore.setActiveFile(null);
            previewStore.setActivePreviewMode(null);
            
            try {
              await previewStore.loadNotebookTabs(notebookId);
            } catch (tabError) {
              // Don't fail the entire operation if tab loading fails
            }
          } else {
            store.setNotebookId(notebook.id);
            store.setNotebookTitle(notebook.name || `Notebook ${notebook.id.slice(0, 8)}`);
            store.clearCells(); // This will create a default title cell
          }
          
          // Update access statistics
          try {
            await NotebookORM.updateNotebookAccess(notebookId);
          } catch (error) {
            console.warn('Failed to update notebook access statistics:', error);
          }
          
          onSelectNotebook?.(notebookId, notebook.name || `Notebook ${notebook.id.slice(0, 8)}`);
        } catch (error) {          
          // Fallback: Create new notebook
          const store = useNotebookStore.getState();
          store.setNotebookId(notebook.id);
          store.setNotebookTitle(notebook.name || `Notebook ${notebook.id.slice(0, 8)}`);
          store.clearCells();
          
          onSelectNotebook?.(notebookId, notebook.name || `Notebook ${notebook.id.slice(0, 8)}`);
        }
      }
    },
    [notebooks, onSelectNotebook]
  );

  const handleToggleStar = useCallback((notebookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleStar(notebookId);
  }, [toggleStar]);

  const handleDeleteConfirm = useCallback(async () => {
    if (selectedNotebook) {
      try {
        const success = await deleteNotebook(selectedNotebook);
        if (success) {
          message.success('笔记本已成功删除');
          closeDeleteModal();
        } else {
          message.error('删除笔记本失败，请重试');
        }
      } catch (error) {
        console.error('Delete notebook error:', error);
      }
    }
  }, [selectedNotebook, deleteNotebook, closeDeleteModal]);

  const handleExportNotebook = useCallback(async (notebookId: string) => {
    try {
      await exportNotebook(notebookId);
    } catch (error) {
      console.error('Export notebook error:', error);
    }
  }, [exportNotebook]);

  // Computed values
  const totalSize = useMemo(
    () => notebooks.reduce((sum, n) => sum + (n.totalSize || 0), 0),
    [notebooks]
  );

  const selectedNotebookData = useMemo(
    () => notebooks.find((n) => n.id === selectedNotebook),
    [notebooks, selectedNotebook]
  );

  // Add keyboard shortcuts for debugger and cleanup tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setShowCleanupTool(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full bg-gray-50 overflow-hidden relative"
      {...handlers}
      style={{
        transform: `translateX(${swipeDistance * 0.3}px)`,
        transition: swipeDistance === 0 ? 'transform 0.3s ease-out' : 'none',
      }}
    >
      {/* Swipe Indicator */}
      <SwipeIndicator swipeDistance={swipeDistance} visible={swipeDistance > 0} />

      {/* Header */}
      <LibraryHeader
        totalNotebooks={notebooks.length}
        totalSize={totalSize}
        searchQuery={searchQuery}
        viewMode={viewMode}
        refreshing={refreshing}
        onBack={onBack}
        onSearchChange={setSearchQuery}
        onViewModeChange={setViewMode}
        onRefresh={refreshNotebooks}
      />

      {/* Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <NotebookList
          notebooks={filteredNotebooks}
          viewMode={viewMode}
          loading={loading}
          searchQuery={searchQuery}
          onSelectNotebook={handleSelectNotebook}
          onToggleStar={handleToggleStar}
          onDeleteNotebook={openDeleteModal}
          onExportNotebook={handleExportNotebook}
        />
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        title="删除 Notebook"
        open={showDeleteModal}
        onOk={handleDeleteConfirm}
        onCancel={closeDeleteModal}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>
          确定要删除 Notebook <strong>"{selectedNotebookData?.name || selectedNotebook}"</strong> 吗？
          此操作会清空其本地缓存，且无法撤销。
        </p>
        {selectedNotebookData && (
          <div className="mt-3 text-sm text-gray-600">
            <p>包含 {selectedNotebookData.fileCount} 个文件</p>
            <p>总大小: {Math.round((selectedNotebookData.totalSize || 0) / 1024)} KB</p>
          </div>
        )}
      </Modal>

      {/* Storage Cleanup Tool - Toggle with Ctrl+Shift+C */}
      <StorageCleanupTool visible={showCleanupTool} />
    </div>
  );
};

export default LibraryState;