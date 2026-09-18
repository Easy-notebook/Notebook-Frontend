// LibraryState/views/LibraryView.tsx
// Main LibraryView component - refactored to use Controller pattern

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Modal } from 'antd';
import LibraryHeader from './components/LibraryHeader';
import NotebookList from './components/NotebookList';
import SwipeIndicator from './components/SwipeIndicator';
import StorageCleanupTool from './components/StorageCleanupTool';
import { useSwipeGesture } from '../utils';
import { useLibraryController } from '../controllers/LibraryController';
import type { LibraryStateProps } from '../types';

const LibraryView: React.FC<LibraryStateProps> = ({ onBack, onSelectNotebook }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showCleanupTool, setShowCleanupTool] = useState(false);

  // Use Controller for logic and state
  const controller = useLibraryController({ onSelectNotebook });

  // Swipe gesture for back navigation
  const { swipeDistance, handlers } = useSwipeGesture(() => onBack?.());

  // Wrap handleSelectNotebook to include navigation callback
  const handleSelectNotebook = (notebookId: string) => {
    controller.handleSelectNotebook(notebookId, onSelectNotebook);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setShowCleanupTool((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Computed total size for header
  const totalSize = useMemo(
    () => controller.notebooks.reduce((sum, n) => sum + (n.totalSize || 0), 0),
    [controller.notebooks]
  );

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden relative flex flex-col"
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
        totalNotebooks={controller.notebooks.length}
        totalSize={totalSize}
        searchQuery={controller.searchQuery}
        viewMode={controller.viewMode}
        refreshing={controller.refreshing}
        onBack={onBack}
        onSearchChange={controller.setSearchQuery}
        onViewModeChange={controller.setViewMode}
        onRefresh={controller.refreshNotebooks}
      />

      {/* Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <NotebookList
          notebooks={controller.notebooks}
          viewMode={controller.viewMode}
          loading={controller.loading}
          searchQuery={controller.searchQuery}
          onSelectNotebook={handleSelectNotebook}
          onCreateNotebook={controller.handleCreateNotebook}
          onToggleStar={(id) => controller.handleToggleStar(id)}
          onDeleteNotebook={controller.openDeleteModal}
          onExportNotebook={controller.handleExportNotebook}
        />
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        title="删除 Notebook"
        open={controller.showDeleteModal}
        onOk={controller.handleDeleteNotebook}
        onCancel={controller.closeDeleteModal}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>
          确定要删除 Notebook{' '}
          <strong>
            &quot;{controller.selectedNotebookData?.name || controller.selectedNotebook}&quot;
          </strong>{' '}
          吗？ 此操作会清空其本地缓存，且无法撤销。
        </p>
        {controller.selectedNotebookData && (
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            <p>包含 {controller.selectedNotebookData.fileCount} 个文件</p>
            <p>总大小: {Math.round((controller.selectedNotebookData.totalSize || 0) / 1024)} KB</p>
          </div>
        )}
      </Modal>

      {/* Storage Cleanup Tool - Toggle with Ctrl+Shift+C */}
      <StorageCleanupTool visible={showCleanupTool} />
    </div>
  );
};

export default LibraryView;
