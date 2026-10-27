import { useState } from 'react';
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
  const [profile, setProfile] = useState<'report' | 'prompt'>('report');
  const selected = profile === 'prompt';
  const label = selected ? '选定提示词' : '知识报告';
  const scope = JSON.stringify([notebookId, workspace, revision, profile]);
  const { state, read } = useScopedNativeRead(scope, busy, async (signal) => {
    const client = new NativeStudyClient(notebookId);
    if (profile === 'report') return client.knowledgeReport(workspace, revision, signal);
    const { prompt, ...owner } = await client.knowledgePrompt(workspace, revision, signal);
    return { ...owner, report: prompt };
  });
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        导出内容
        <select
          className="ml-2 rounded border p-2"
          value={profile}
          disabled={busy}
          onChange={(event) => setProfile(event.target.value === 'prompt' ? 'prompt' : 'report')}
        >
          <option value="report">完整知识报告</option>
          <option value="prompt">FoKn 固定提示词选集</option>
        </select>
      </label>
      {selected && (
        <p className="text-sm text-muted-foreground">
          仅选取固定章节的描述，可能不包含分群与近邻证据。选集会标明省略数量；完整证据仍可在知识报告中查看。
          这次导出不会更改模型使用的上下文。
        </p>
      )}
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={busy || state.status === 'loading'}
        onClick={() => void read()}
      >
        {state.status === 'loading' ? `正在生成${label}` : `生成可下载${label}`}
      </button>
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <>
          <p className="text-sm">
            {label} · 修订 {state.value.revision} · {state.value.agent}
          </p>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() =>
              downloadBlob(
                new Blob([state.value.report], { type: 'text/markdown;charset=utf-8' }),
                `${selected ? 'knowledge-prompt' : 'knowledge'}-revision-${state.value.revision}.md`
              )
            }
          >
            下载{label} Markdown
          </button>
          <details>
            <summary className="text-sm">报告原文</summary>
            <pre
              aria-label={`${label} Markdown`}
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
