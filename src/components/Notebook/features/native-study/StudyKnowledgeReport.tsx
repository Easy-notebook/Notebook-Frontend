import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { downloadBlob } from '@Services/notebook/BrowserDownload';
import { useScopedNativeRead } from './useScopedNativeRead';

/** Export the server-rendered snapshot only while its notebook and revision remain visible. */
export function StudyKnowledgeReport({
  notebookId,
  workspace,
  revision,
  busy,
}: {
  notebookId: string;
  workspace: string;
  revision: number;
  busy: boolean;
}) {
  const scope = JSON.stringify([notebookId, workspace, revision]);
  const { state, read } = useScopedNativeRead(scope, busy, (signal) =>
    new NativeStudyClient(notebookId).knowledgeReport(workspace, revision, signal)
  );
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={busy || state.status === 'loading'}
        onClick={() => void read()}
      >
        {state.status === 'loading' ? '正在生成知识报告' : '生成可下载知识报告'}
      </button>
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <>
          <p className="text-sm">
            知识报告 · 修订 {state.value.revision} · {state.value.agent}
          </p>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() =>
              downloadBlob(
                new Blob([state.value.report], { type: 'text/markdown;charset=utf-8' }),
                `knowledge-revision-${state.value.revision}.md`
              )
            }
          >
            下载知识报告 Markdown
          </button>
          <details>
            <summary className="text-sm">报告原文</summary>
            <pre
              aria-label="知识报告 Markdown"
              className="overflow-auto whitespace-pre-wrap break-all text-xs"
            >
              {state.value.report}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
