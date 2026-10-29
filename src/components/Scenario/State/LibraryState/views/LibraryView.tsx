// LibraryState/views/LibraryView.tsx
// Main LibraryView component - refactored to use Controller pattern

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Modal } from 'antd';
import LibraryHeader, { type LibraryFilter } from './components/LibraryHeader';
import './library.css';
import NotebookList from './components/NotebookList';
import SwipeIndicator from './components/SwipeIndicator';
import StorageCleanupTool from './components/StorageCleanupTool';
import { useSwipeGesture } from '../utils';
import { useLibraryController } from '../controllers/LibraryController';
import type { LibraryStateProps } from '../types';

const LibraryView: React.FC<LibraryStateProps> = ({ onBack, onSelectNotebook }) => {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [customizing, setCustomizing] = useState<string | null>(null);
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<'document' | 'project' | 'chat'>('document');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showCleanupTool, setShowCleanupTool] = useState(false);

  // Use Controller for logic and state
  const controller = useLibraryController({ onSelectNotebook });

  const visibleNotebooks = useMemo(
    () =>
      controller.notebooks.filter(
        (nb) =>
          filter === 'all' ||
          (filter === 'favorites' ? nb.isStarred : nb.presentation?.kind === filter)
      ),
    [controller.notebooks, filter]
  );
  const customize = (id: string) => {
    const item = controller.notebooks.find((nb) => nb.id === id);
    setIcon(item?.library?.icon ?? '');
    setKind(item?.presentation?.kind ?? 'document');
    setCustomizing(id);
  };

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
      className="library-page"
      {...handlers}
      style={{
        transform: `translateX(${swipeDistance * 0.3}px)`,
        transition: swipeDistance === 0 ? 'transform 0.3s ease-out' : 'none',
      }}
    >
      {/* Swipe Indicator */}
      <SwipeIndicator swipeDistance={swipeDistance} visible={swipeDistance > 0} />

      <div className="library-shell">
        {/* Header */}
        <LibraryHeader
          filter={filter}
          onFilter={setFilter}
          onCreate={controller.handleCreateNotebook}
          sortBy={controller.sortBy}
          onSort={controller.setSortBy}
          count={visibleNotebooks.length}
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
        <div className="library-content">
          <NotebookList
            notebooks={visibleNotebooks}
            viewMode={controller.viewMode}
            loading={controller.loading}
            searchQuery={controller.searchQuery}
            onCustomize={customize}
            onSelectNotebook={handleSelectNotebook}
            onCreateNotebook={controller.handleCreateNotebook}
            onToggleStar={(id) => controller.handleToggleStar(id)}
            onDeleteNotebook={controller.openDeleteModal}
            onExportNotebook={controller.handleExportNotebook}
          />
        </div>
      </div>
      <Modal
        title="图标与类型"
        open={!!customizing}
        onCancel={() => setCustomizing(null)}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        onOk={async () => {
          if (!customizing) return;
          setSaving(true);
          try {
            await controller.updateLibrary(customizing, { icon: icon.trim(), kind });
            setCustomizing(null);
          } catch {
            /* Controller reports the storage failure. Keep draft open. */
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="library-customize">
          <label>
            自定义图标
            <input
              aria-label="自定义图标"
              value={icon}
              maxLength={12}
              placeholder="输入 emoji 或短字符"
              onChange={(e) => setIcon(e.target.value)}
            />
          </label>
          <div className="library-icon-options">
            {['📄', '📁', '🔬', '📊', '💬', '✦'].map((value) => (
              <button key={value} aria-label={`使用 ${value}`} onClick={() => setIcon(value)}>
                {value}
              </button>
            ))}
            <button onClick={() => setIcon('')}>使用来源图标</button>
          </div>
          <label>
            项目类型
            <select
              aria-label="项目类型"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="document">文档</option>
              <option value="project">项目</option>
              <option value="chat">聊天记录</option>
            </select>
          </label>
        </div>
      </Modal>
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
