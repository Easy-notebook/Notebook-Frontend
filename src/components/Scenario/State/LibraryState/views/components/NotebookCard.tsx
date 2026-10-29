import { memo } from 'react';
import { Dropdown } from 'antd';
import { MoreHorizontal, Star } from 'lucide-react';
import { LibraryItemIcon, libraryKindLabel } from './LibraryItemIcon';
import type { NotebookCardProps } from '../../types';
const relativeTime = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
function activity(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 60
    ? relativeTime.format(-minutes, 'minute')
    : minutes < 1440
      ? relativeTime.format(-Math.floor(minutes / 60), 'hour')
      : relativeTime.format(-Math.floor(minutes / 1440), 'day');
}
const NotebookCard = memo(
  ({
    notebook,
    viewMode,
    onSelect,
    onToggleStar,
    onDelete,
    onExport,
    onCustomize,
  }: NotebookCardProps) => (
    <article className={`library-item library-item--${viewMode}`}>
      <button
        className="library-open"
        onClick={() => onSelect(notebook.id)}
        aria-label={`打开 ${notebook.name}`}
      >
        <LibraryItemIcon notebook={notebook} />
        <span className="library-item-heading">
          <strong>{notebook.name}</strong>
          <span>{libraryKindLabel(notebook)}</span>
        </span>
        {viewMode === 'grid' && (
          <p className="library-preview">{notebook.presentation?.preview || '还没有内容'}</p>
        )}
        <time
          title={new Date(notebook.lastAccessedAt).toLocaleString()}
          dateTime={new Date(notebook.lastAccessedAt).toISOString()}
        >
          {activity(notebook.lastAccessedAt)}
        </time>
      </button>
      <div className="library-item-actions">
        <button
          aria-label={notebook.isStarred ? `取消收藏 ${notebook.name}` : `收藏 ${notebook.name}`}
          aria-pressed={!!notebook.isStarred}
          onClick={(event) => onToggleStar(notebook.id, event)}
        >
          <Star size={16} fill={notebook.isStarred ? 'currentColor' : 'none'} />
        </button>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'customize', label: '图标与类型', onClick: () => onCustomize?.(notebook.id) },
              { key: 'export', label: '导出', onClick: () => onExport?.(notebook.id) },
              { type: 'divider' },
              { key: 'delete', label: '删除', danger: true, onClick: () => onDelete(notebook.id) },
            ],
          }}
        >
          <button aria-label={`${notebook.name} 的更多操作`}>
            <MoreHorizontal size={19} />
          </button>
        </Dropdown>
      </div>
    </article>
  )
);
NotebookCard.displayName = 'NotebookCard';
export default NotebookCard;
