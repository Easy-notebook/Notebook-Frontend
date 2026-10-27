import { useRef, useState, type ReactNode } from 'react';
import useStore from '@Store/notebookStore';
import { NotebookActionScope } from '@Services/notebook/NotebookActionScope';
import { notebookContextService } from '@Services/notebook-context/instance';
import { kindLabels, type EntryKind, type SourceIdentity } from '@Services/notebook-context/model';

/** Selection is captured from one message, including its rendered text snapshot and exact offsets. */
export function FactCapture({
  source,
  children,
  disabled = false,
}: {
  source: SourceIdentity;
  children: ReactNode;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    source: SourceIdentity;
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [kind, setKind] = useState<EntryKind>('fact');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const capture = () => {
    if (disabled || saving || !root.current) return;
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return;
    const range = selected.getRangeAt(0);
    if (!root.current.contains(range.startContainer) || !root.current.contains(range.endContainer))
      return;
    const before = range.cloneRange();
    before.selectNodeContents(root.current);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.cloneContents().textContent?.length ?? 0;
    const length = range.cloneContents().textContent?.length ?? 0;
    const text = root.current.textContent || '';
    if (!length || !text.slice(start, start + length).trim()) return;
    setSelection({ source: { ...source }, text, start, end: start + length });
    setTitle(
      text
        .slice(start, start + length)
        .trim()
        .split('\n')[0]
        .slice(0, 80)
    );
    setStatus('');
  };
  const save = async () => {
    if (!selection || disabled || saving) return;
    if (useStore.getState().notebookId !== selection.source.notebookId) {
      setStatus('Notebook 已切换，请重新选择。');
      return;
    }
    const scope = new NotebookActionScope();
    setSaving(true);
    setStatus('');
    try {
      await notebookContextService.capture(
        {
          ...selection.source,
          id: crypto.randomUUID(),
          text: selection.text,
          capturedAt: new Date().toISOString(),
        },
        kind,
        title,
        selection.start,
        selection.end,
        scope.signal
      );
      if (useStore.getState().notebookId === selection.source.notebookId) {
        setSelection(null);
        setStatus(`已存入${kindLabels[kind]} · 上下文档案`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      scope.dispose();
      setSaving(false);
    }
  };
  return (
    <div>
      <div ref={root} onMouseUp={capture} onKeyUp={capture} data-context-source={source.messageId}>
        {children}
      </div>
      {selection && !disabled && (
        <div
          className="my-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"
          contentEditable={false}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <p className="line-clamp-3 whitespace-pre-wrap text-slate-600">
            “{selection.text.slice(selection.start, selection.end)}”
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="摘录类型"
              value={kind}
              disabled={saving}
              onChange={(event) => setKind(event.target.value as EntryKind)}
              className="rounded border bg-white p-1"
            >
              <option value="fact">关键事实</option>
              <option value="origin">出发点</option>
              <option value="lead">线索</option>
            </select>
            <input
              aria-label="摘录标题"
              value={title}
              maxLength={160}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
              className="min-w-32 flex-1 rounded border px-2 py-1"
            />
            <button
              type="button"
              disabled={saving || !title.trim()}
              onClick={() => void save()}
              className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存摘录'}
            </button>
            <button type="button" disabled={saving} onClick={() => setSelection(null)}>
              取消
            </button>
          </div>
          <p className="text-xs text-slate-500">
            保留原文和来源；助手的表述不会自动成为已验证结论。
          </p>
        </div>
      )}
      {status && (
        <p role="status" className="my-1 text-xs text-slate-600">
          {status}
        </p>
      )}
    </div>
  );
}
