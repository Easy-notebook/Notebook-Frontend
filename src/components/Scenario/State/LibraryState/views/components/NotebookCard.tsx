import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  Star,
  StarOff,
  Clock,
  FileText,
  MoreHorizontal,
  Edit,
  Download,
  Trash2,
} from 'lucide-react';
import { usePersistence } from '@Services/persistence/PersistenceContext';
import CodeCell from '@Editor/Cells/CodeCell';
import MarkdownCell from '@Editor/Cells/MarkdownCell';
import HybridCell from '@Editor/Cells/HybridCell';
import ImageCell from '@Editor/Cells/ImageCell';
import LinkCell from '@Editor/Cells/LinkCell';
import FileTags from './FileTags';
import NotebookStats from './NotebookStats';
import { formatTime, formatSize } from '../../utils';
import type { NotebookCardProps } from '../../types';
import { Card, CardContent } from '@/components/UI/card';

interface PreviewCell {
  id: string;
  type: 'code' | 'markdown' | 'hybrid' | 'Hybrid' | 'image' | 'link' | string;
  content: string;
  outputs?: unknown[];
  metadata?: Record<string, unknown>;
}

const looksLikeBase64 = (s: string): boolean =>
  /^[A-Za-z0-9+/=\s]+$/.test(s) && s.replace(/\s+/g, '').length % 4 === 0;

export const NotebookCard: React.FC<NotebookCardProps> = memo(
  ({ notebook, viewMode, onSelect, onToggleStar, onDelete, onExport }) => {
    const [previewCells, setPreviewCells] = useState<PreviewCell[]>([]);
    const persistence = usePersistence();

    // Load notebook cells for preview
    useEffect(() => {
      let cancelled = false;

      const loadCells = async () => {
        try {
          const main = await persistence.files.getFile(notebook.id, `notebook_${notebook.id}.json`);
          const raw = main?.content;

          if (!raw) {
            if (!cancelled) setPreviewCells([]);
            return;
          }

          let text = '';
          if (typeof raw === 'string') {
            text = raw;
          } else if (raw && typeof (raw as Blob).text === 'function') {
            text = await (raw as Blob).text();
          } else {
            if (!cancelled) setPreviewCells([]);
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
              if (!cancelled) setPreviewCells([]);
              return;
            }
          }

          const cells: unknown = (data as { cells?: unknown })?.cells;
          if (Array.isArray(cells) && cells.length > 0) {
            const previewData: PreviewCell[] = cells
              .slice(0, 5)
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
            if (!cancelled) setPreviewCells(previewData);
          } else {
            if (!cancelled) setPreviewCells([]);
          }
        } catch (error) {
          console.warn(`Failed to load preview cells for ${notebook.id}:`, error);
          if (!cancelled) setPreviewCells([]);
        }
      };

      void loadCells();
      return () => {
        cancelled = true;
      };
    }, [notebook.id, persistence.files]);

    // Render read-only preview cell
    const renderCellPreview = useCallback((cell: PreviewCell) => {
      const commonProps = {
        cell: {
          ...cell,
          content: cell.content.length > 150 ? `${cell.content.slice(0, 150)}...` : cell.content,
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
        className: 'pointer-events-none transform scale-75 origin-top-left mb-1',
      } as const;

      switch (cell.type) {
        case 'code':
          return <CodeCell key={cell.id} {...(commonProps as Parameters<typeof CodeCell>[0])} />;
        case 'markdown':
          return (
            <MarkdownCell key={cell.id} {...(commonProps as Parameters<typeof MarkdownCell>[0])} />
          );
        case 'hybrid':
        case 'Hybrid':
          return (
            <HybridCell key={cell.id} {...(commonProps as Parameters<typeof HybridCell>[0])} />
          );
        case 'image':
          return <ImageCell key={cell.id} {...(commonProps as Parameters<typeof ImageCell>[0])} />;
        case 'link':
          return <LinkCell key={cell.id} {...(commonProps as Parameters<typeof LinkCell>[0])} />;
        default:
          return (
            <MarkdownCell key={cell.id} {...(commonProps as Parameters<typeof MarkdownCell>[0])} />
          );
      }
    }, []);

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

    // Notebook preview cover
    const notebookPreviewCover = useMemo(
      () => (
        <div className="h-48 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 overflow-hidden relative rounded-t-3xl">
          <div className="p-10 space-y-0 bg-theme-100 dark:bg-theme-900/50">
            {previewCells.length > 0 ? (
              previewCells.map((cell) => renderCellPreview(cell))
            ) : (
              <div className="text-gray-400 text-sm p-8 text-center">
                <div className="text-2xl mb-2">📝</div>
                <div>Empty Notebook</div>
              </div>
            )}
          </div>

          {/* Bottom fade gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-16" />

          {/* Star indicator */}
          {notebook.isStarred && (
            <div className="absolute top-3 right-3">
              <Star className="w-5 h-5 text-yellow-500 fill-current drop-shadow-sm" />
            </div>
          )}

          {/* Last accessed time */}
          <div className="absolute top-3 left-3 rounded-lg px-2 py-1 text-xs text-gray-600 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(notebook.lastAccessedAt)}
            </div>
          </div>
        </div>
      ),
      [notebook.isStarred, notebook.lastAccessedAt, previewCells, renderCellPreview]
    );

    if (viewMode === 'grid') {
      return (
        <Card className="cursor-pointer" onClick={handleCardClick}>
          {/* Cover/Preview */}
          {notebookPreviewCover}

          {/* Content */}
          <CardContent className="p-4">
            <div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {notebook.name || `Notebook ${notebook.id.slice(0, 8)}`}
            </div>
            <div className="space-y-2">
              {notebook.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                  {notebook.description}
                </p>
              )}
              <NotebookStats
                fileCount={notebook.fileCount}
                accessCount={notebook.accessCount}
                totalSize={notebook.totalSize}
              />
              {/* <FileTags files={notebook.lastOpenedFiles} /> */}
            </div>
          </CardContent>

          {/* Actions */}
          <div className="flex items-center justify-around border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-3xl">
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
            <Button type="text" icon={<FileText className="w-4 h-4" />} />
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button
                type="text"
                icon={<MoreHorizontal className="w-4 h-4" />}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        </Card>
      );
    }

    // List view
    return (
      <Card className="mb-2 cursor-pointer" onClick={handleCardClick}>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base">
                    {notebook.name || `Notebook ${notebook.id.slice(0, 8)}`}
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
                <div className="text-xs dark:text-gray-500">{notebook.accessCount ?? 0} visits</div>
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
    );
  }
);

NotebookCard.displayName = 'NotebookCard';

export default NotebookCard;
