import { useEffect, useState } from 'react';
import NotebookCard from './NotebookCard';
import type { NotebookListProps } from '../../types';
export default function NotebookList({
  notebooks,
  viewMode,
  loading,
  searchQuery,
  onSelectNotebook,
  onToggleStar,
  onDeleteNotebook,
  onExportNotebook,
  onCustomize,
}: NotebookListProps & { loading?: boolean; searchQuery?: string; onCreateNotebook?: () => void }) {
  const [limit, setLimit] = useState(40);
  useEffect(() => setLimit(40), [searchQuery]);
  if (loading)
    return (
      <div className="library-empty" role="status">
        正在加载资料库…
      </div>
    );
  if (!notebooks.length)
    return (
      <div className="library-empty">
        <h2>没有找到项目</h2>
        <p>{searchQuery ? '试试其他关键词或筛选条件。' : '新建文档，或调整上方的分类。'}</p>
      </div>
    );
  return (
    <>
      {viewMode === 'list' && (
        <div className="library-columns">
          <span>名称</span>
          <span>最近活动</span>
          <span />
        </div>
      )}
      <div className={`library-items library-items--${viewMode}`}>
        {notebooks.slice(0, limit).map((notebook) => (
          <NotebookCard
            key={notebook.id}
            notebook={notebook}
            viewMode={viewMode}
            onSelect={onSelectNotebook}
            onToggleStar={onToggleStar}
            onDelete={onDeleteNotebook}
            onExport={onExportNotebook}
            onCustomize={onCustomize}
          />
        ))}
      </div>
      {notebooks.length > limit && (
        <button className="library-more" onClick={() => setLimit((n) => n + 40)}>
          显示更多（剩余 {notebooks.length - limit}）
        </button>
      )}
    </>
  );
}
