import { useEffect, useRef, useState } from 'react';
import type { NotebookAgentIdentity } from '@Services/agent-cell/NotebookAgentIdentity';
import { importAndConnectSession, sessionRequest } from '@Services/agent-cell/SessionImportService';
import type { SessionHistory } from '@Services/agent-cell/SessionHistoryImport';
type Entry = SessionHistory['info'];
export function SessionImportPanel({
  profile,
  close,
}: {
  profile: NotebookAgentIdentity;
  close(): void;
}) {
  const [provider, setProvider] = useState<'codex' | 'claude'>(profile.provider);
  const [sessionId, setSessionId] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [preview, setPreview] = useState<SessionHistory>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);
  const perform = async (action: (signal: AbortSignal) => Promise<void>) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) setError(String(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const list = (next?: string) =>
    void perform(async (signal) => {
      const page = await sessionRequest<{ entries: Entry[]; nextCursor: string | null }>(
        'list',
        { provider, cursor: next },
        signal
      );
      if (!signal.aborted) {
        setEntries(page.entries);
        setCursor(page.nextCursor);
      }
    });
  const read = (id: string) =>
    void perform(async (signal) => {
      setPreview(undefined);
      const history = await sessionRequest<SessionHistory>(
        'preview',
        { provider, sessionId: id },
        signal
      );
      if (!signal.aborted) {
        setSessionId(id);
        setPreview(history);
      }
    });
  return (
    <section className="mt-3 space-y-2 rounded border p-3" aria-label="导入原始 session">
      <p>
        选择本机原始 session。连接后发送的消息会继续写入该 session；不会创建分支。原 CLI
        中请先停止生成。
      </p>
      <div className="flex gap-2">
        <select
          aria-label="Session 提供方"
          disabled={busy}
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as typeof provider);
            setEntries([]);
            setPreview(undefined);
            setSessionId('');
            setCursor(null);
          }}
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
        </select>
        <button disabled={busy} onClick={() => list()}>
          读取本机会话
        </button>
        <button disabled={busy} onClick={close}>
          关闭
        </button>
      </div>
      <div className="flex gap-2">
        <input
          aria-label="原始 session ID"
          placeholder="Session ID"
          value={sessionId}
          disabled={busy}
          onChange={(e) => {
            setSessionId(e.target.value);
            setPreview(undefined);
          }}
          className="min-w-0 flex-1 rounded border bg-transparent p-1"
        />
        <button disabled={busy || !sessionId.trim()} onClick={() => read(sessionId.trim())}>
          预览 session
        </button>
      </div>
      <ul className="max-h-40 overflow-y-auto space-y-1">
        {entries.map((entry) => (
          <li key={entry.sessionId}>
            <button
              disabled={busy}
              className="block w-full text-left rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
              onClick={() => read(entry.sessionId)}
              title={`${entry.sessionId}\n${entry.cwd}`}
            >
              <span className="block truncate">{entry.title}</span>
              <span className="block truncate opacity-60">{entry.cwd}</span>
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => list(cursor)}>
          下一页
        </button>
      )}
      {preview && (
        <div className="space-y-2">
          <p className="break-all">
            {preview.info.title}
            <br />
            {preview.info.sessionId}
            <br />
            {preview.info.cwd}
          </p>
          <p>{preview.messages.length} 条记录 · 导入正文、代码和工具记录，保留现有 notebook 内容</p>
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap">
            {preview.messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .slice(0, 4)
              .map((m) => `${m.role}: ${m.text}`)
              .join('\n\n')
              .slice(0, 6000)}
          </pre>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await importAndConnectSession(profile, preview);
                close();
              })
            }
          >
            导入记录并连接原 session
          </button>
        </div>
      )}
      {busy && <p role="status">处理中…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
