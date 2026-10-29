import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import ReactMarkdown from 'react-markdown';
import {
  NotebookVersionHistory,
  type NotebookVersion,
} from '@Services/notebook/NotebookVersionHistory';
import { NotebookFileCommands } from '@Services/notebook/NotebookFileCommands';
import { downloadBlob } from '@Services/notebook/BrowserDownload';

function preview(content: string) {
  try {
    const doc = JSON.parse(content);
    if (Array.isArray(doc.cells))
      return {
        label: `${doc.cells.length} 个单元格 · 只读预览（前 24,000 字符）`,
        text: doc.cells
          .map((cell: { content?: unknown; source?: unknown }) =>
            typeof cell.content === 'string'
              ? cell.content
              : typeof cell.source === 'string'
                ? cell.source
                : ''
          )
          .join('\n\n')
          .slice(0, 24000),
      };
  } catch {
    /* A history record can also contain a plain text artifact. */
  }
  return { label: '只读预览（最多 24,000 字符）', text: content.slice(0, 24000) };
}
export function VersionHistoryDialog({
  notebookId,
  onClose,
  onRestored,
}: {
  notebookId: string;
  onClose: () => void;
  onRestored: (path: string) => Promise<void>;
}) {
  const history = useMemo(() => new NotebookVersionHistory(notebookId), [notebookId]);
  const [versions, setVersions] = useState<NotebookVersion[]>([]);
  const [selected, setSelected] = useState<NotebookVersion>();
  const [content, setContent] = useState<string>();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void history
      .list(controller.signal)
      .then((records) => {
        if (!controller.signal.aborted) {
          setVersions(records);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [history]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setContent(undefined);
    setError('');
    setMessage('');
    setName(`恢复-${selected.name}`);
    void history
      .read(selected.id, controller.signal)
      .then((text) => {
        if (!controller.signal.aborted) setContent(text);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [history, selected]);
  const restore = async () => {
    if (!selected || saving) return;
    try {
      const path = NotebookFileCommands.child('/', name);
      setSaving(true);
      setError('');
      await history.restore(selected, path);
      await onRestored(path);
      setMessage(`已恢复为工作区文件 ${name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const view = content === undefined ? undefined : preview(content);
  return (
    <Modal
      open
      title="版本历史"
      footer={null}
      width={820}
      onCancel={onClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
    >
      <p className="text-xs text-slate-500 mb-4">
        原始快照和备份只读保存。恢复会创建新文件，不覆盖当前 notebook。
      </p>
      <div className="flex gap-4 min-h-[320px]">
        <div className="w-52 shrink-0 border-r border-slate-200 dark:border-slate-700 pr-3 space-y-1">
          {loading && <p role="status">加载版本…</p>}
          {!loading && !versions.length && <p>暂无版本记录</p>}
          {versions.map((version) => (
            <button
              key={version.id}
              className={`w-full text-left rounded px-3 py-2 ${selected?.id === version.id ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              disabled={saving}
              onClick={() => setSelected(version)}
            >
              <span className="block text-xs text-slate-500">
                {version.kind === 'original' ? '原始快照' : '备份'} ·{' '}
                {(version.size / 1024).toFixed(1)} KB
              </span>
              <span className="block truncate" title={version.name}>
                {version.name}
              </span>
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {!selected && <p className="text-slate-500">选择一条记录查看内容</p>}
          {selected && (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-500">{view?.label ?? '正在读取…'}</span>
                <Button
                  size="small"
                  disabled={content === undefined}
                  onClick={() =>
                    downloadBlob(
                      new Blob([content!], { type: 'text/plain;charset=utf-8' }),
                      selected.name
                    )
                  }
                >
                  下载
                </Button>
              </div>
              <div className="max-h-72 overflow-auto text-sm border rounded p-3 prose dark:prose-invert max-w-none">
                <ReactMarkdown>{view?.text ?? ''}</ReactMarkdown>
              </div>
              <label htmlFor="history-restore-name" className="block text-xs mt-4 mb-1">
                恢复为新文件
              </label>
              <div className="flex gap-2">
                <Input
                  id="history-restore-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
                <Button onClick={restore} loading={saving} disabled={content === undefined}>
                  恢复副本
                </Button>
              </div>
              {message && (
                <p role="status" className="text-green-600 text-xs mt-2">
                  {message}
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-red-600 mt-2 text-xs">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
