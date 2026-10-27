import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import ReactMarkdown from 'react-markdown';
import useStore from '@Store/notebookStore';
import { notebookContextService } from '@Services/notebook-context/instance';
import { NotebookKnowledgeDocument, contextRoot } from '@Services/notebook-context/model';
import { agentCellService } from '@Services/agent-cell/agentCellService';
import type { AgentProvider } from '@Services/agent-cell/protocol';
import { saveAs } from 'file-saver';
import './NotebookContextPanel.css';

export function NotebookContextPanel({ readOnly = false }: { readOnly?: boolean }) {
  const notebookId = useStore((state) => state.notebookId);
  const [showDirectory, setShowDirectory] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<AgentProvider>('codex');
  const [organizing, setOrganizing] = useState(false);
  const [path, setPath] = useState(`${contextRoot}/30-context/current.md`);
  const value = useSyncExternalStore(notebookContextService.subscribe, () =>
    notebookId ? notebookContextService.snapshot(notebookId) : undefined
  );
  const files = useMemo(
    () => (value ? new NotebookKnowledgeDocument(value).files() : new Map<string, string>()),
    [value]
  );
  useEffect(() => {
    setError('');
    setPath(`${contextRoot}/30-context/current.md`);
    if (!notebookId) return;
    const controller = new AbortController();
    const refresh = () => {
      void notebookContextService.load(notebookId, controller.signal).catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('focus', refresh);
    };
  }, [notebookId]);
  const organize = async () => {
    setOrganizing(true);
    setError('');
    try {
      await agentCellService.organize(provider);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setOrganizing(false);
    }
  };
  const download = async () => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const [name, content] of files) zip.file(name, content);
      saveAs(await zip.generateAsync({ type: 'blob' }), `notebook-context-${notebookId}.zip`);
    } catch (error) {
      setError(String(error));
    }
  };
  const selectFile = (name: string) => {
    setPath(name);
    setShowDirectory(false);
  };
  const folders: Record<string, string> = {
    '00-origins': '出发点',
    '10-facts': '关键事实',
    '20-leads': '线索',
    '30-context': '当前上下文',
    '40-sources': '来源快照',
    '90-history': '历史版本',
  };
  return (
    <section className="notebook-context" aria-label="上下文档案" contentEditable={false}>
      <header className="notebook-context__header">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">上下文档案</h2>
          <span className="text-xs opacity-60">
            {value ? `${value.entries.length} 条 · v${value.revision}` : ''}
          </span>
        </div>
        <p className="mt-2 text-xs opacity-70">在聊天中选取文字，保存出发点、关键事实与线索。</p>
        <div className="notebook-context__toolbar">
          <select
            aria-label="整理 agent provider"
            value={provider}
            disabled={organizing || readOnly}
            onChange={(event) => setProvider(event.target.value as AgentProvider)}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude Agent</option>
          </select>
          <button
            type="button"
            disabled={organizing || readOnly || !value?.entries.length}
            onClick={() => void organize()}
          >
            {organizing ? '整理中…' : '整理上下文'}
          </button>
          <button type="button" disabled={!value?.revision} onClick={() => void download()}>
            导出 ZIP
          </button>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            aria-expanded={showDirectory}
            onClick={() => setShowDirectory(!showDirectory)}
          >
            {showDirectory ? '返回阅读' : '浏览目录'}
          </button>
          {path !== `${contextRoot}/30-context/current.md` && (
            <button
              type="button"
              onClick={() => selectFile(`${contextRoot}/30-context/current.md`)}
            >
              当前上下文
            </button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {!notebookId ? (
        <p className="p-3">请先打开 notebook。</p>
      ) : !value ? (
        <p className="p-3">读取上下文…</p>
      ) : showDirectory ? (
        <nav aria-label="上下文文件夹" className="notebook-context__directory">
          <button type="button" onClick={() => selectFile(`${contextRoot}/README.md`)}>
            阅读入口
          </button>
          {Object.entries(folders).map(([folder, title]) => {
            const entries = [...files.keys()].filter(
              (name) => name.startsWith(`${contextRoot}/${folder}/`) && name.endsWith('.md')
            );
            return (
              <details key={folder} open={folder === '30-context'}>
                <summary>
                  {title}
                  <span className="ml-2 opacity-50 text-xs">
                    {entries.filter((name) => !name.endsWith('/index.md')).length}
                  </span>
                </summary>
                {entries.map((name) => (
                  <button
                    type="button"
                    key={name}
                    title={name}
                    aria-current={path === name ? 'page' : undefined}
                    onClick={() => selectFile(name)}
                  >
                    {files.get(name)?.split('\n')[0].replace(/^# /, '') || name}
                  </button>
                ))}
              </details>
            );
          })}
        </nav>
      ) : (
        <article aria-label="上下文文档" className="notebook-context__document">
          {!value.entries.length && (
            <p className="notebook-context__empty">
              尚无摘录。选中聊天中的关键文字，点击「保存摘录」，即可在这里持续维护上下文。
            </p>
          )}
          {(value.entries.length > 0 || path !== `${contextRoot}/30-context/current.md`) && (
            <ReactMarkdown
              components={{
                a: ({ href, children }) => {
                  let target: string | undefined;
                  try {
                    const url = new URL(href || '', `https://notebook.invalid/${path}`);
                    if (url.origin === 'https://notebook.invalid')
                      target = decodeURIComponent(url.pathname.slice(1));
                  } catch {
                    /* Invalid links remain text. */
                  }
                  return target && files.has(target) ? (
                    <button type="button" onClick={() => selectFile(target!)}>
                      {children}
                    </button>
                  ) : (
                    <span>{children}</span>
                  );
                },
              }}
            >
              {files.get(path) || '该文件不存在。'}
            </ReactMarkdown>
          )}
        </article>
      )}
    </section>
  );
}
