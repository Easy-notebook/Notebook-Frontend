import { Grid2X2, List, Plus, RefreshCw, Search } from 'lucide-react';
import type { LibraryHeaderProps, SortBy } from '../../types';
export type LibraryFilter = 'all' | 'favorites' | 'chat' | 'document' | 'project';
const filters: Array<[LibraryFilter, string]> = [
  ['all', '全部'],
  ['favorites', '收藏'],
  ['chat', '聊天记录'],
  ['document', '文档'],
  ['project', '项目'],
];
export default function LibraryHeader({
  searchQuery,
  viewMode,
  refreshing,
  onSearchChange,
  onViewModeChange,
  onRefresh,
  filter,
  onFilter,
  onCreate,
  sortBy,
  onSort,
  count,
}: LibraryHeaderProps & {
  filter: LibraryFilter;
  onFilter: (value: LibraryFilter) => void;
  onCreate: () => void;
  sortBy: SortBy;
  onSort: (value: SortBy) => void;
  count: number;
}) {
  return (
    <header className="library-header">
      <h1>资料库</h1>
      <div className="library-search-row">
        <label className="library-search">
          <Search size={21} />
          <input
            aria-label="搜索资料库"
            placeholder="搜索资料库"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button aria-label="清除搜索" onClick={() => onSearchChange('')}>
              ×
            </button>
          )}
        </label>
        <button
          className="library-create"
          aria-label="新建文档"
          title="新建文档"
          onClick={onCreate}
        >
          <Plus size={24} />
        </button>
      </div>
      <nav className="library-filters" aria-label="资料库分类">
        {filters.map(([value, label]) => (
          <button key={value} aria-pressed={value === filter} onClick={() => onFilter(value)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="library-controls">
        <span>{count} 个项目</span>
        <div>
          <button aria-label="刷新资料库" title="刷新" disabled={refreshing} onClick={onRefresh}>
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <select
            aria-label="排序"
            value={sortBy}
            onChange={(e) => onSort(e.target.value as SortBy)}
          >
            <option value="recent">最近活动</option>
            <option value="name">名称</option>
            <option value="size">大小</option>
          </select>
          <span className="library-control-divider" />
          <button
            aria-label="网格视图"
            title="网格视图"
            aria-pressed={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
          >
            <Grid2X2 size={19} />
          </button>
          <button
            aria-label="列表视图"
            title="列表视图"
            aria-pressed={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
          >
            <List size={21} />
          </button>
        </div>
      </div>
    </header>
  );
}
