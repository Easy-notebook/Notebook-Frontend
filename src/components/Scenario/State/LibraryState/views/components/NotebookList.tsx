// LibraryState/NotebookList.tsx
// Notebook list component with Magic Bento and Masonry layout

import React, { memo, useMemo, useState, useCallback, useEffect } from 'react';
import { Empty, Button, Card, Skeleton } from 'antd';
import { Star, Calendar, Plus } from 'lucide-react';
import NotebookCard from './NotebookCard';
import { MasonryGrid, BentoItem, calculateBentoSize } from './MasonryGrid';
import type { NotebookListProps, CachedNotebook, BentoSize } from '../../types';
import { useInView } from '@/hooks/useInView';

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
    const [visibleCount, setVisibleCount] = useState(20);

    // Sentinel for infinite scroll
    const [sentinelRef, isSentinelInView] = useInView({
      rootMargin: '1200px', // Load more before reaching the absolute bottom
    });

    // Load more when sentinel comes into view
    useEffect(() => {
      if (isSentinelInView) {
        setVisibleCount((prev) => prev + 20);
      }
    }, [isSentinelInView]);

    // Reset visible count when search query changes
    useEffect(() => {
      setVisibleCount(20);
    }, [searchQuery]);

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

    // Calculate bento sizes for all notebooks
    const notebooksWithSizes = useMemo(() => {
      const allNotebooks = [...starredNotebooks, ...regularNotebooks];
      return allNotebooks.map((notebook, index) => ({
        notebook,
        bentoSize: calculateBentoSize(notebook, index, allNotebooks.length),
      }));
    }, [starredNotebooks, regularNotebooks]);

    // Get starred notebooks with sizes
    const starredWithSizes = useMemo(() => {
      return notebooksWithSizes.filter(({ notebook }) => notebook.isStarred);
    }, [notebooksWithSizes]);

    // Get regular notebooks with sizes - Apply pagination here
    const regularWithSizes = useMemo(() => {
      const regular = notebooksWithSizes.filter(({ notebook }) => !notebook.isStarred);
      return regular.slice(0, visibleCount);
    }, [notebooksWithSizes, visibleCount]);

    const hasMore = regularNotebooks.length > visibleCount;

    const listClassName = 'space-y-0';

    if (loading) {
      return (
        <MasonryGrid>
          {[...Array(8)].map((_, i) => (
            <BentoItem key={i} size={i === 0 ? 'featured' : i % 3 === 0 ? 'large' : 'small'}>
              <Card loading className="h-full">
                <Skeleton active />
              </Card>
            </BentoItem>
          ))}
        </MasonryGrid>
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

    // Render notebook card with bento size
    const renderNotebookCard = (notebook: CachedNotebook, bentoSize: BentoSize) => (
      <BentoItem key={notebook.id} size={viewMode === 'grid' ? bentoSize : 'small'}>
        <NotebookCard
          notebook={notebook}
          viewMode={viewMode}
          bentoSize={viewMode === 'grid' ? bentoSize : 'small'}
          onSelect={onSelectNotebook}
          onToggleStar={onToggleStar}
          onDelete={onDeleteNotebook}
          onExport={onExportNotebook}
        />
      </BentoItem>
    );

    // List view uses simple layout
    if (viewMode === 'list') {
      return (
        <>
          {/* Starred Section */}
          {starredNotebooks.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                Starred ({starredNotebooks.length})
              </h2>
              <div className={listClassName}>
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
              <div className={listClassName}>
                {regularNotebooks.slice(0, visibleCount).map((notebook) => (
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
              {/* Sentinel for infinite scroll */}
              {hasMore && <div ref={sentinelRef} className="h-20 w-full" />}
            </div>
          )}
        </>
      );
    }

    // Grid view uses Magic Bento + Masonry layout
    return (
      <>
        {/* Starred Section with Bento Layout */}
        {starredWithSizes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Starred ({starredWithSizes.length})
            </h2>
            <MasonryGrid>
              {starredWithSizes.map(({ notebook, bentoSize }) =>
                renderNotebookCard(notebook, bentoSize)
              )}
            </MasonryGrid>
          </div>
        )}

        {/* Recent Section with Bento Layout */}
        {regularWithSizes.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-500 dark:text-green-400" />
              {starredWithSizes.length > 0 ? 'Recent' : 'All'} ({regularNotebooks.length})
            </h2>
            <MasonryGrid>
              {regularWithSizes.map(({ notebook, bentoSize }) =>
                renderNotebookCard(notebook, bentoSize)
              )}
            </MasonryGrid>
            {/* Sentinel for infinite scroll */}
            {hasMore && <div ref={sentinelRef} className="h-20 w-full" />}
          </div>
        )}
      </>
    );
  }
);

NotebookList.displayName = 'NotebookList';

export default NotebookList;
