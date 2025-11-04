// LeftSideBar/Main/Empty/EmptySidebar.tsx
// Sidebar component for displaying notebook history when in empty state

import React, { memo, useCallback } from 'react';
import { Empty, Button, Skeleton } from 'antd';
import { Plus, Star,Trees, Repeat ,PanelLeftClose } from 'lucide-react';
import { navigateToWorkspace, navigateToLibrary } from '@Utils/navigation';
import NotebookHistoryCard from './NotebookHistoryCard';
import { useNotebooks } from './hooks';

interface EmptySidebarProps {
  // Any additional props if needed
}

const EmptySidebar: React.FC<EmptySidebarProps> = memo(() => {
  // Use similar hooks pattern as LibraryState
  const {
    notebooks,
    loading,
    refreshNotebooks,
    isCreatingNotebook,
    createNotebook,
    toggleStar,
  } = useNotebooks();

  // Handle notebook selection - navigate to workspace
  const handleSelectNotebook = useCallback((notebookId: string) => {
    navigateToWorkspace(notebookId);
  }, []);

  // Separate starred and recent notebooks
  const starredNotebooks = notebooks.filter(nb => nb.isStarred);
  const recentNotebooks = notebooks.filter(nb => !nb.isStarred).slice(0, 6);

  // Loading skeleton
  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton.Input active size="small" style={{ width: 120 }} />
            <Skeleton.Button active size="small" style={{ width: 60 }} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} active paragraph={{ rows: 2 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 align-middle justify-center my-auto">
              <h1 className="text-lg font-semibold text-gray-900">Recent</h1>
              <span className="text-xs text-gray-400">({recentNotebooks.length})</span>
          </div>
          <div className="flex items-center gap-2">
          <Button 
            type="primary" 
            icon={<Plus className="w-4 h-4" />}
            onClick={createNotebook}
            loading={isCreatingNotebook}
            size="small"
            style={{
              borderRadius: 8,
              boxShadow: '0 2px 4px 0 rgb(0 0 0 / 0.05)'
            }}
          >
          </Button>
          <Button 
            type="primary" 
            icon={<Trees className="w-4 h-4" />}
            onClick={navigateToLibrary}
            loading={isCreatingNotebook}
            size="small"
            style={{
              borderRadius: 8,
              boxShadow: '0 2px 4px 0 rgb(0 0 0 / 0.05)'
            }}
          >
          </Button>
          <Button 
            type="primary" 
            icon={<Repeat className="w-4 h-4" />}
            onClick={refreshNotebooks}
            loading={isCreatingNotebook}
            size="small"
          >
          </Button>
          {/* <Button 
            type="primary" 
            icon={<PanelLeftClose className="w-4 h-4" />}
            onClick={closeSidebar}
            loading={isCreatingNotebook}
            size="small"
          >
          </Button> */}
          </div>
        </div>

        {/* Starred Notebooks */}
        {starredNotebooks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-yellow-500 fill-current" />
              <h3 className="text-sm font-medium text-gray-700">Starred</h3>
              <span className="text-xs text-gray-400">({starredNotebooks.length})</span>
            </div>
            <div className="space-y-2">
              {starredNotebooks.map(notebook => (
                <NotebookHistoryCard
                  key={notebook.id}
                  notebook={notebook}
                  onSelect={handleSelectNotebook}
                  onToggleStar={(notebookId, e) => toggleStar(notebookId, e)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent Notebooks */}
        {recentNotebooks.length > 0 && (
          <div>
            <div className="space-y-2">
              {recentNotebooks.map(notebook => (
                <NotebookHistoryCard
                  key={notebook.id}
                  notebook={notebook}
                  onSelect={handleSelectNotebook}
                  onToggleStar={(notebookId, e) => toggleStar(notebookId, e)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {notebooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              imageStyle={{ height: 80 }}
              description={
                <div className="text-center space-y-3">
                  <p className="text-gray-500 text-sm">No notebooks yet</p>
                  <Button 
                    type="primary" 
                    icon={<Plus className="w-4 h-4" />}
                    onClick={createNotebook}
                    loading={isCreatingNotebook}
                    style={{
                      borderRadius: 8,
                      boxShadow: '0 2px 4px 0 rgb(0 0 0 / 0.05)'
                    }}
                  >
                    Create your first notebook
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
});

EmptySidebar.displayName = 'EmptySidebar';

export default EmptySidebar;