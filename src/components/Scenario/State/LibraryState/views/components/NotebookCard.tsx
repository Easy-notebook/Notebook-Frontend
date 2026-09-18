import React, { memo, useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  Star,
  StarOff,
  Clock,
  MoreHorizontal,
  Edit,
  Download,
  Trash2,
  FileText,
  Eye,
  Code,
  FileImage,
  Link2,
} from 'lucide-react';
import { usePersistence } from '@Services/persistence/PersistenceContext';
import FileTags from './FileTags';
import NotebookStats from './NotebookStats';
import { formatTime, formatSize } from '../../utils';
import type { NotebookCardProps, BentoSize } from '../../types';
import { Card, CardContent } from '@/components/UI/card';
import { useInView } from '@/hooks/useInView';

// Lazy load heavy cell components
const CodeCell = lazy(() => import('@Editor/Cells/CodeCell'));
const MarkdownCell = lazy(() => import('@Editor/Cells/MarkdownCell'));
const HybridCell = lazy(() => import('@Editor/Cells/HybridCell'));
const ImageCell = lazy(() => import('@Editor/Cells/ImageCell'));
const LinkCell = lazy(() => import('@Editor/Cells/LinkCell'));

interface PreviewCell {
  id: string;
  type: 'code' | 'markdown' | 'hybrid' | 'Hybrid' | 'image' | 'link' | string;
  content: string;
  outputs?: unknown[];
  metadata?: Record<string, unknown>;
}

const looksLikeBase64 = (s: string): boolean =>
  /^[A-Za-z0-9+/=\s]+$/.test(s) && s.replace(/\s+/g, '').length % 4 === 0;

// Lightweight preview placeholder while full cell loads
const LightweightPreview: React.FC<{ cell: PreviewCell; scale: string }> = memo(
  ({ cell, scale }) => {
    const getIcon = () => {
      switch (cell.type) {
        case 'code':
          return <Code className="w-3 h-3 text-blue-500" />;
        case 'image':
          return <FileImage className="w-3 h-3 text-green-500" />;
        case 'link':
          return <Link2 className="w-3 h-3 text-purple-500" />;
        default:
          return <FileText className="w-3 h-3 text-gray-500" />;
      }
    };

    const truncatedContent =
      cell.content.length > 80 ? `${cell.content.slice(0, 80)}...` : cell.content;

    return (
      <div
        className={`transform ${scale} origin-top-left mb-1 p-2 rounded-md bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/30 dark:border-gray-700/30`}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex-shrink-0">{getIcon()}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-pre-wrap break-words line-clamp-2">
            {truncatedContent}
          </div>
        </div>
      </div>
    );
  }
);

LightweightPreview.displayName = 'LightweightPreview';

// Loading skeleton for preview area
const PreviewSkeleton: React.FC<{ height: string }> = memo(({ height }) => (
  <div
    className={`${height} bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 overflow-hidden relative rounded-t-3xl`}
  >
    <div className="p-6 space-y-2 animate-pulse">
      <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-3/4" />
      <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-1/2" />
      <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-5/6" />
      <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-2/3" />
    </div>
    <div className="absolute top-3 left-3 h-6 w-20 rounded-full bg-white/40 dark:bg-black/30 animate-pulse" />
  </div>
));

PreviewSkeleton.displayName = 'PreviewSkeleton';

// Bento size configuration for different card sizes
// maxCells: number of Jupyter cells to load and display in preview
const bentoConfig: Record<
  BentoSize,
  {
    previewHeight: string;
    maxCells: number;
    showDescription: boolean;
    showFileTags: boolean;
    titleSize: string;
    contentPadding: string;
    previewScale: string;
  }
> = {
  small: {
    previewHeight: 'h-40',
    maxCells: 3, // Load first 3 cells
    showDescription: false,
    showFileTags: false,
    titleSize: 'text-base',
    contentPadding: 'p-4',
    previewScale: 'scale-[0.65]',
  },
  medium: {
    previewHeight: 'h-56',
    maxCells: 3, // Load first 3 cells
    showDescription: true,
    showFileTags: false,
    titleSize: 'text-lg',
    contentPadding: 'p-5',
    previewScale: 'scale-75',
  },
  large: {
    previewHeight: 'h-44',
    maxCells: 3, // Load first 3 cells
    showDescription: true,
    showFileTags: true,
    titleSize: 'text-xl',
    contentPadding: 'p-5',
    previewScale: 'scale-75',
  },
  featured: {
    previewHeight: 'h-64',
    maxCells: 3, // Load first 3 cells
    showDescription: true,
    showFileTags: true,
    titleSize: 'text-2xl',
    contentPadding: 'p-6',
    previewScale: 'scale-[0.8]',
  },
};

// Configuration for preview mode
// Set to false to use full Jupyter notebook cell components for preview
const LIGHTWEIGHT_PREVIEW_MODE = false;

export const NotebookCard: React.FC<NotebookCardProps> = memo(
  ({ notebook, viewMode, bentoSize = 'small', onSelect, onToggleStar, onDelete, onExport }) => {
    const [previewCells, setPreviewCells] = useState<PreviewCell[]>([]);
    const [derivedTitle, setDerivedTitle] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const persistence = usePersistence();

    // Lazy load trigger
    const [cardRef, isInView] = useInView({
      triggerOnce: true,
      rootMargin: '200px 0px', // Start loading 200px before it comes into view
    });

    // Get config for current bento size
    const config = bentoConfig[bentoSize];

    // Load notebook cells for preview
    useEffect(() => {
      if (!isInView) return;

      let cancelled = false;
      setIsLoading(true);

      const loadCells = async () => {
        try {
          // Add small delay to prevent blocking the main thread
          await new Promise((resolve) => setTimeout(resolve, 50));

          const main = await persistence.files.getFile(notebook.id, `notebook_${notebook.id}.json`);
          const raw = main?.content;

          if (!raw) {
            if (!cancelled) {
              setPreviewCells([]);
              setIsLoading(false);
            }
            return;
          }

          let text = '';
          if (typeof raw === 'string') {
            text = raw;
          } else if (raw && typeof (raw as Blob).text === 'function') {
            text = await (raw as Blob).text();
          } else {
            if (!cancelled) {
              setPreviewCells([]);
              setIsLoading(false);
            }
            return;
          }

          let data: unknown = null;

          try {
            data = JSON.parse(text);
          } catch {
            try {
              if (looksLikeBase64(text)) {
                const decoded = atob(text);
                data = JSON.parse(decoded);
              }
            } catch (err) {
              console.warn(`Failed to parse notebook data for ${notebook.id}:`, err);
              if (!cancelled) {
                setPreviewCells([]);
                setIsLoading(false);
              }
              return;
            }
          }

          const cells: unknown = (data as { cells?: unknown })?.cells;
          if (Array.isArray(cells) && cells.length > 0) {
            const previewData: PreviewCell[] = cells
              .slice(0, config.maxCells) // Use config for max cells
              .map(
                (
                  cell: {
                    source?: string | string[];
                    content?: string;
                    cell_type?: string;
                    cellType?: string;
                    outputs?: unknown[];
                    metadata?: Record<string, unknown>;
                  },
                  index: number
                ) => {
                  const source = cell?.source ?? cell?.content ?? '';
                  const content = Array.isArray(source) ? source.join('') : String(source ?? '');
                  const trimmed = content.trim();

                  return {
                    id: `preview-${notebook.id}-${index}`,
                    type: (cell?.cell_type ?? cell?.cellType ?? 'markdown') as PreviewCell['type'],
                    content: trimmed,
                    outputs: Array.isArray(cell?.outputs) ? cell.outputs : [],
                    metadata: cell?.metadata ?? {},
                  };
                }
              )
              .filter((c) => c.content !== '');

            // Find title from first cell
            let foundTitle = '';
            if (cells.length > 0) {
              const firstCell = cells[0] as {
                cell_type?: string;
                cellType?: string;
                source?: string | string[];
                content?: string;
              };

              const source = firstCell?.source ?? firstCell?.content ?? '';
              const content = Array.isArray(source) ? source.join('') : String(source ?? '');

              // Try to match H1 first
              const h1Match = content.match(/^#\s+(.+)$/m);
              if (h1Match) {
                foundTitle = h1Match[1].trim();
              } else {
                // Fallback to first line
                foundTitle = content
                  .split('\n')[0]
                  .replace(/^#+\s*/, '')
                  .trim();
              }
            }

            if (!cancelled) {
              setPreviewCells(previewData);
              if (foundTitle) setDerivedTitle(foundTitle);
              setIsLoading(false);
            }
          } else {
            if (!cancelled) {
              setPreviewCells([]);
              setDerivedTitle('');
              setIsLoading(false);
            }
          }
        } catch (error) {
          console.warn(`Failed to load preview cells for ${notebook.id}:`, error);
          if (!cancelled) {
            setPreviewCells([]);
            setIsLoading(false);
          }
        }
      };

      void loadCells();
      return () => {
        cancelled = true;
      };
    }, [notebook.id, persistence.files, isInView, config.maxCells]);

    // Render read-only preview cell - with lightweight mode option
    const renderCellPreview = useCallback(
      (cell: PreviewCell) => {
        // Use lightweight preview for better performance
        if (LIGHTWEIGHT_PREVIEW_MODE) {
          return <LightweightPreview key={cell.id} cell={cell} scale={config.previewScale} />;
        }

        // Full cell preview (heavier but more accurate)
        const contentLength = bentoSize === 'featured' ? 200 : bentoSize === 'large' ? 180 : 150;
        const commonProps = {
          cell: {
            ...cell,
            content:
              cell.content.length > contentLength
                ? `${cell.content.slice(0, contentLength)}...`
                : cell.content,
          },
          isActive: false,
          isEditing: false,
          onEdit: () => {},
          onDelete: () => {},
          onAddCell: () => {},
          onUpdateCell: () => {},
          onMoveUp: () => {},
          onMoveDown: () => {},
          readOnly: true,
          className: `pointer-events-none transform ${config.previewScale} origin-top-left mb-1`,
        } as const;

        const cellFallback = <LightweightPreview cell={cell} scale={config.previewScale} />;

        switch (cell.type) {
          case 'code':
            return (
              <Suspense key={cell.id} fallback={cellFallback}>
                <CodeCell {...(commonProps as Parameters<typeof CodeCell>[0])} />
              </Suspense>
            );
          case 'markdown':
            return (
              <Suspense key={cell.id} fallback={cellFallback}>
                <MarkdownCell {...(commonProps as Parameters<typeof MarkdownCell>[0])} />
              </Suspense>
            );
          case 'hybrid':
          case 'Hybrid':
            return (
              <Suspense key={cell.id} fallback={cellFallback}>
                <HybridCell {...(commonProps as Parameters<typeof HybridCell>[0])} />
              </Suspense>
            );
          case 'image':
            return (
              <Suspense key={cell.id} fallback={cellFallback}>
                <ImageCell {...(commonProps as Parameters<typeof ImageCell>[0])} />
              </Suspense>
            );
          case 'link':
            return (
              <Suspense key={cell.id} fallback={cellFallback}>
                <LinkCell {...(commonProps as Parameters<typeof LinkCell>[0])} />
              </Suspense>
            );
          default:
            return (
              <Suspense key={cell.id} fallback={cellFallback}>
                <MarkdownCell {...(commonProps as Parameters<typeof MarkdownCell>[0])} />
              </Suspense>
            );
        }
      },
      [bentoSize, config.previewScale]
    );

    const handleCardClick = useCallback(() => {
      onSelect(notebook.id);
    }, [notebook.id, onSelect]);

    const handleStarClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement | SVGElement>) => {
        e.stopPropagation();
        onToggleStar(notebook.id, e);
      },
      [notebook.id, onToggleStar]
    );

    const menuItems = useMemo<MenuProps['items']>(() => {
      return [
        {
          key: 'star',
          label: notebook.isStarred ? 'Unstar' : 'Star',
          icon: notebook.isStarred ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />,
          onClick: (info) => {
            info?.domEvent?.stopPropagation();
            onToggleStar(notebook.id, info.domEvent as React.MouseEvent);
          },
        },
        {
          key: 'edit',
          label: 'Rename',
          icon: <Edit className="w-4 h-4" />,
          disabled: true,
        },
        {
          key: 'download',
          label: 'Export',
          icon: <Download className="w-4 h-4" />,
          onClick: (info) => {
            info?.domEvent?.stopPropagation();
            onExport?.(notebook.id);
          },
        },
        { type: 'divider' as const },
        {
          key: 'delete',
          label: 'Delete',
          icon: <Trash2 className="w-4 h-4" />,
          danger: true,
          onClick: (info) => {
            info?.domEvent?.stopPropagation();
            onDelete(notebook.id);
          },
        },
      ];
    }, [notebook.id, notebook.isStarred, onDelete, onExport, onToggleStar]);

    // Get cells to display based on bento size
    const displayCells = useMemo(() => {
      return previewCells.slice(0, config.maxCells);
    }, [previewCells, config.maxCells]);

    // Show loading state
    const showLoading = !isInView || isLoading;

    // Notebook preview cover
    const notebookPreviewCover = useMemo(() => {
      // Show skeleton while loading or not in view
      if (showLoading) {
        return <PreviewSkeleton height={config.previewHeight} />;
      }

      return (
        <div
          className={`${config.previewHeight} bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 overflow-hidden relative rounded-t-3xl`}
        >
          <div className="p-6 space-y-0 bg-theme-100 dark:bg-theme-900/50">
            {displayCells.length > 0 ? (
              displayCells.map((cell) => renderCellPreview(cell))
            ) : (
              <div className="text-gray-400 text-sm p-8 text-center">
                <div className="text-2xl mb-2">📝</div>
                <div>Empty Notebook</div>
              </div>
            )}
          </div>

          {/* Bottom fade gradient - improved transition */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/50 to-transparent dark:from-gray-900 dark:via-gray-900/50 pointer-events-none" />

          {/* Star indicator */}
          {notebook.isStarred && (
            <div className="absolute top-3 left-3">
              <Star className="w-5 h-5 text-yellow-500 fill-current drop-shadow-sm" />
            </div>
          )}

          {/* Last accessed time - Acrylic badge */}
          <div className="absolute top-3 right-3 rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-black/40 backdrop-blur-md border border-white/20 shadow-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatTime(notebook.lastAccessedAt)}
            </div>
          </div>

          {/* Bento size indicator for featured cards */}
          {bentoSize === 'featured' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur-md border border-amber-200/50 dark:border-amber-700/50">
              Featured
            </div>
          )}
        </div>
      );
    }, [
      notebook.isStarred,
      notebook.lastAccessedAt,
      displayCells,
      renderCellPreview,
      config.previewHeight,
      bentoSize,
      showLoading,
    ]);

    if (viewMode === 'grid') {
      // Featured cards have a special two-column layout
      const isFeatured = bentoSize === 'featured';
      const isLarge = bentoSize === 'large';

      return (
        <div ref={cardRef} className="h-full">
          <Card
            className={`cursor-pointer group transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 border-gray-200/50 dark:border-gray-800/50 overflow-hidden bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm h-full flex flex-col ${
              isFeatured ? 'ring-2 ring-amber-200/50 dark:ring-amber-700/30' : ''
            }`}
            onClick={handleCardClick}
          >
            {/* Cover/Preview */}
            {notebookPreviewCover}

            {/* Content */}
            <CardContent className={`${config.contentPadding} flex-1 flex flex-col`}>
              <div
                className={`${config.titleSize} font-serif font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 dark:from-white dark:via-gray-200 dark:to-gray-400 mb-3 tracking-tight line-clamp-2`}
              >
                {derivedTitle || notebook.name || `Notebook ${notebook.id.slice(0, 8)}`}
              </div>
              <div className="space-y-3 flex-1">
                {config.showDescription && notebook.description && (
                  <p
                    className={`text-sm text-gray-500 dark:text-gray-400 leading-relaxed ${isFeatured ? 'line-clamp-3' : 'line-clamp-2'}`}
                  >
                    {notebook.description}
                  </p>
                )}

                {/* Enhanced stats display for featured/large cards */}
                {isFeatured || isLarge ? (
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50/80 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-200/50 dark:border-blue-700/30">
                      <FileText className="w-3.5 h-3.5" />
                      {notebook.fileCount ?? 0} files
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-200/50 dark:border-emerald-700/30">
                      {formatSize(notebook.totalSize)}
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50/80 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-medium border border-violet-200/50 dark:border-violet-700/30">
                      <Eye className="w-3.5 h-3.5" />
                      {notebook.accessCount ?? 0} visits
                    </div>
                  </div>
                ) : (
                  <NotebookStats
                    fileCount={notebook.fileCount}
                    accessCount={notebook.accessCount}
                    totalSize={notebook.totalSize}
                  />
                )}

                {/* File tags for large/featured cards */}
                {config.showFileTags &&
                  notebook.lastOpenedFiles &&
                  notebook.lastOpenedFiles.length > 0 && (
                    <div className="mt-auto pt-2">
                      <FileTags files={notebook.lastOpenedFiles} maxVisible={isFeatured ? 5 : 3} />
                    </div>
                  )}
              </div>
            </CardContent>

            {/* Actions - Acrylic Footer */}
            <div className="flex items-center justify-end gap-1 border-t border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-md rounded-b-3xl py-2 px-4 transition-colors group-hover:bg-white/60 dark:group-hover:bg-black/60 mt-auto">
              <Tooltip title={notebook.isStarred ? 'Unstar' : 'Star'}>
                <Button
                  type="text"
                  icon={
                    notebook.isStarred ? (
                      <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    ) : (
                      <StarOff className="w-4 h-4" />
                    )
                  }
                  onClick={handleStarClick as React.MouseEventHandler<HTMLButtonElement>}
                />
              </Tooltip>
              <Tooltip title="Export">
                <Button
                  type="text"
                  icon={<Download className="w-4 h-4" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onExport?.(notebook.id);
                  }}
                />
              </Tooltip>
              <Tooltip title="Delete">
                <Button
                  type="text"
                  danger
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(notebook.id);
                  }}
                />
              </Tooltip>
            </div>
          </Card>
        </div>
      );
    }

    // List view
    return (
      <div ref={cardRef}>
        <Card className="mb-2 cursor-pointer" onClick={handleCardClick}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif font-bold text-gray-900 dark:text-gray-100 text-lg tracking-tight line-clamp-2">
                      {derivedTitle || notebook.name || `Notebook ${notebook.id.slice(0, 8)}`}
                    </h3>
                    {notebook.isStarred && (
                      <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {notebook.description || 'No description'}
                  </div>
                  <div className="mt-2">
                    <FileTags files={notebook.lastOpenedFiles} maxVisible={5} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 ml-4">
                <div className="text-right">
                  <div className="font-medium dark:text-gray-300">
                    {notebook.fileCount ?? 0} files
                  </div>
                  <div className="text-xs dark:text-gray-500">{formatSize(notebook.totalSize)}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium dark:text-gray-300">
                    {formatTime(notebook.lastAccessedAt)}
                  </div>
                  <div className="text-xs dark:text-gray-500">
                    {notebook.accessCount ?? 0} visits
                  </div>
                </div>
                <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreHorizontal className="w-4 h-4" />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
);

NotebookCard.displayName = 'NotebookCard';

export default NotebookCard;
