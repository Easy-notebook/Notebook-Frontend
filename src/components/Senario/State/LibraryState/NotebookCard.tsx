import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Dropdown } from 'antd';
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
import { FileORM } from '@Storage/index';
import CodeCell from '@Editor/Cells/CodeCell';
import MarkdownCell from '@Editor/Cells/MarkdownCell';
import HybridCell from '@Editor/Cells/HybridCell';
import ImageCell from '@Editor/Cells/ImageCell';
import LinkCell from '@Editor/Cells/LinkCell';
import FileTags from './FileTags';
import NotebookStats from './NotebookStats';
import { formatTime, formatSize } from './utils';
import type { NotebookCardProps } from './types';

const { Meta } = Card;

interface PreviewCell {
  id: string;
  type: 'code' | 'markdown' | 'hybrid' | 'Hybrid' | 'image' | 'link' | string;
  content: string;
  outputs?: unknown[];
  metadata?: Record<string, unknown>;
}

const looksLikeBase64 = (s: string): boolean =>
  /^[A-Za-z0-9+/=\s]+$/.test(s) && s.replace(/\s+/g, '').length % 4 === 0;

const NotebookCard: React.FC<NotebookCardProps> = memo(
  ({ notebook, viewMode, onSelect, onToggleStar, onDelete, onExport }) => {
    const [previewCells, setPreviewCells] = useState<PreviewCell[]>([]);

    // Load notebook cells for preview
    useEffect(() => {
      let cancelled = false;

      const loadCells = async () => {
        try {
          const main = await FileORM.getFile(notebook.id, `notebook_${notebook.id}.json`);
          const raw = main?.content;

          if (!raw) {
            if (!cancelled) setPreviewCells([]);
            return;
          }

          let text = '';
          if (typeof raw === 'string') {
            text = raw;
          } else if (raw && typeof (raw as any).text === 'function') {
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

          const cells: unknown = (data as any)?.cells;
          if (Array.isArray(cells) && cells.length > 0) {
            const previewData: PreviewCell[] = cells
              .slice(0, 5)
              .map((cell: any, index: number) => {
                const source = cell?.source ?? cell?.content ?? '';
                const content =
                  Array.isArray(source) ? source.join('') : String(source ?? '');
                const trimmed = content.trim();

                return {
                  id: `preview-${notebook.id}-${index}`,
                  type: (cell?.cell_type ?? cell?.cellType ?? 'markdown') as PreviewCell['type'],
                  content: trimmed,
                  outputs: Array.isArray(cell?.outputs) ? cell.outputs : [],
                  metadata: cell?.metadata ?? {},
                };
              })
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
    }, [notebook.id]);

    // Render read-only preview cell
    const renderCellPreview = useCallback((cell: PreviewCell) => {
      const commonProps = {
        cell: {
          ...cell,
          content:
            cell.content.length > 150
              ? `${cell.content.slice(0, 150)}...`
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
        className: 'pointer-events-none transform scale-75 origin-top-left mb-1',
      } as const;

      switch (cell.type) {
        case 'code':
          return <CodeCell key={cell.id} {...(commonProps as any)} />;
        case 'markdown':
          return <MarkdownCell key={cell.id} {...(commonProps as any)} />;
        case 'hybrid':
        case 'Hybrid':
          return <HybridCell key={cell.id} {...(commonProps as any)} />;
        case 'image':
          return <ImageCell key={cell.id} {...(commonProps as any)} />;
        case 'link':
          return <LinkCell key={cell.id} {...(commonProps as any)} />;
        default:
          return <MarkdownCell key={cell.id} {...(commonProps as any)} />;
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
      [notebook.id, onToggleStar],
    );

    const menuItems = useMemo<MenuProps['items']>(() => {
      return [
        {
          key: 'star',
          label: notebook.isStarred ? 'Unstar' : 'Star',
          icon: notebook.isStarred ? (
            <StarOff className="w-4 h-4" />
          ) : (
            <Star className="w-4 h-4" />
          ),
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
        <div className="h-48 bg-gradient-to-b from-gray-50 to-gray-100 overflow-hidden relative">
          <div className="p-10 space-y-0  bg-theme-100">
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
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-100 to-transparent pointer-events-none" />

          {/* Star indicator */}
          {notebook.isStarred && (
            <div className="absolute top-3 right-3">
              <Star className="w-5 h-5 text-yellow-500 fill-current drop-shadow-sm" />
            </div>
          )}

          {/* Last accessed time */}
          <div className="absolute top-3 left-3 bg-white bg-opacity-80 backdrop-blur-sm rounded-lg px-2 py-1 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(notebook.lastAccessedAt)}
            </div>
          </div>
        </div>
      ),
      [notebook.isStarred, notebook.lastAccessedAt, previewCells, renderCellPreview],
    );

    if (viewMode === 'grid') {
      return (
        <Card
          hoverable
          className="transition-all duration-300 cursor-pointer hover:shadow-md bg-white border-0"
          style={{ 
            borderRadius: 12,
            boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
          }}
          cover={notebookPreviewCover}
          onClick={handleCardClick}
          actions={[
            <Button
              key="star"
              type="text"
              icon={
                notebook.isStarred ? (
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                ) : (
                  <StarOff className="w-4 h-4" />
                )
              }
              onClick={handleStarClick as any}
            />,
            <Button 
              key="files" 
              type="text" 
              icon={<FileText className="w-4 h-4" />} 
            />,
            <Dropdown key="more" menu={{ items: menuItems }} trigger={['click']}>
              <Button
                type="text"
                icon={<MoreHorizontal className="w-4 h-4" />}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>,
          ]}
        >
          <Meta
            title={
              <div className="truncate text-base font-semibold text-gray-900">
                {notebook.name || `Notebook ${notebook.id.slice(0, 8)}`}
              </div>
            }
            description={
              <div className="space-y-2">
                {notebook.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">{notebook.description}</p>
                )}
                <NotebookStats
                  fileCount={notebook.fileCount}
                  accessCount={notebook.accessCount}
                  totalSize={notebook.totalSize}
                />
                {/* <FileTags files={notebook.lastOpenedFiles} /> */}
              </div>
            }
          />
        </Card>
      );
    }

    // List view
    return (
      <Card
        hoverable
        className="mb-2 cursor-pointer hover:shadow-sm transition-shadow bg-white"
        style={{ borderRadius: 8 }}
        onClick={handleCardClick}
      >
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 truncate text-base">
                  {notebook.name || `Notebook ${notebook.id.slice(0, 8)}`}
                </h3>
                {notebook.isStarred && (
                  <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {notebook.description || 'No description'}
              </div>
              <div className="mt-2">
                <FileTags files={notebook.lastOpenedFiles} maxVisible={5} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-500 ml-4">
            <div className="text-right">
              <div className="font-medium">{notebook.fileCount ?? 0} files</div>
              <div className="text-xs">{formatSize(notebook.totalSize)}</div>
            </div>
            <div className="text-right">
              <div className="font-medium">{formatTime(notebook.lastAccessedAt)}</div>
              <div className="text-xs">{notebook.accessCount ?? 0} visits</div>
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
      </Card>
    );
  },
);

NotebookCard.displayName = 'NotebookCard';

export default NotebookCard;