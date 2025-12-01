// LibraryState/NotebookList.tsx
// Notebook list component with sections for starred and recent notebooks

import React, { memo, useMemo, useState, useCallback } from 'react';
import { Empty, Button, Card, Skeleton } from 'antd';
import { Star, Calendar, Plus } from 'lucide-react';
import NotebookCard from './NotebookCard';
import type { NotebookListProps } from '../../types';

const NotebookList: React.FC<
  NotebookListProps & {
    loading?: boolean;
    searchQuery?: string;
    onCreateNotebook?: () => void;
  }
> = memo(
  ({
    notebooks,
    viewMode,
    loading = false,
    searchQuery = '',
    onSelectNotebook,
    onCreateNotebook,
    onToggleStar,
    onDeleteNotebook,
    onExportNotebook,
  }) => {
    const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);

    // Separate starred and regular notebooks
    const { starredNotebooks, regularNotebooks } = useMemo(() => {
      return {
        starredNotebooks: notebooks.filter((n) => n.isStarred),
        regularNotebooks: notebooks.filter((n) => !n.isStarred),
      };
    }, [notebooks]);

    const handleCreateNotebook = useCallback(async () => {
      if (isCreatingNotebook || !onCreateNotebook) return;
      setIsCreatingNotebook(true);
      try {
        await onCreateNotebook();
      } finally {
        setIsCreatingNotebook(false);
      }
    }, [isCreatingNotebook, onCreateNotebook]);

    const gridClassName =
      viewMode === 'grid'
        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
        : 'space-y-0';

    if (loading) {
      return (
        <div className={gridClassName}>
          {[...Array(8)].map((_, i) => (
            <Card key={i} loading>
              <Skeleton active />
            </Card>
          ))}
        </div>
      );
    }

    if (notebooks.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={searchQuery ? 'No matching Notebook' : 'No Notebook'}
          >
            {!searchQuery && onCreateNotebook && (
              <Button
                type="primary"
                icon={<Plus className="w-4 h-4" />}
                loading={isCreatingNotebook}
                onClick={handleCreateNotebook}
              >
                {isCreatingNotebook ? 'Creating...' : 'New Notebook'}
              </Button>
            )}
          </Empty>
        </div>
      );
    }

    return (
      <>
        {/* Starred Section */}
        {starredNotebooks.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Starred ({starredNotebooks.length})
            </h2>
            <div className={gridClassName}>
              {starredNotebooks.map((notebook) => (
                <NotebookCard
                  key={notebook.id}
                  notebook={notebook}
                  viewMode={viewMode}
                  onSelect={onSelectNotebook}
                  onToggleStar={onToggleStar}
                  onDelete={onDeleteNotebook}
                  onExport={onExportNotebook}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent Section */}
        {regularNotebooks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-500 dark:text-green-400" />
              {starredNotebooks.length > 0 ? 'Recent' : 'All'} ({regularNotebooks.length})
            </h2>
            <div className={gridClassName}>
              {regularNotebooks.map((notebook) => (
                <NotebookCard
                  key={notebook.id}
                  notebook={notebook}
                  viewMode={viewMode}
                  onSelect={onSelectNotebook}
                  onToggleStar={onToggleStar}
                  onDelete={onDeleteNotebook}
                  onExport={onExportNotebook}
                />
              ))}
            </div>
          </div>
        )}
      </>
    );
  }
);

NotebookList.displayName = 'NotebookList';

export default NotebookList;
