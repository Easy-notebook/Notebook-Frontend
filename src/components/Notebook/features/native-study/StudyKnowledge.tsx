import { useEffect, useRef, useState } from 'react';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import type { StudyKnowledge as Snapshot } from '@Services/native-study/studyKnowledge';

type Observation =
  | { status: 'idle' }
  | { status: 'loading'; scope: string }
  | { status: 'ready'; scope: string; value: Snapshot }
  | { status: 'error'; scope: string; message: string };

/** An explicit read owns its request; navigation or a changed study invalidates the observation. */
export function StudyKnowledge({
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
  const [state, setState] = useState<Observation>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  const scope = JSON.stringify([notebookId, workspace, revision]);
  const current = useRef(scope);
  current.current = scope;
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setState({ status: 'idle' });
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [scope, busy]);
  const visible = 'scope' in state && state.scope === scope ? state : { status: 'idle' as const };
  const read = async () => {
    if (busy || request.current) return;
    const attempt = new AbortController();
    request.current = attempt;
    setState({ status: 'loading', scope });
    const active = () =>
      !attempt.signal.aborted && request.current === attempt && current.current === scope;
    try {
      const value = await new NativeStudyClient(notebookId).knowledge(
        workspace,
        revision,
        attempt.signal
      );
      if (active()) setState({ status: 'ready', scope, value });
    } catch (error) {
      if (active()) setState({ status: 'error', scope, message: String(error) });
    } finally {
      if (request.current === attempt) request.current = null;
    }
  };
  const snapshot = visible.status === 'ready' ? visible.value : null;
  const groups = snapshot
    ? Object.entries(snapshot.context.learned).flatMap(([area, trees]) =>
        Object.entries(trees).map(([tree, claims]) => ({ area, tree, claims }))
      )
    : [];
  return (
    <section aria-label="研究知识上下文" className="space-y-3">
      <h3 className="font-semibold">当前研究知识</h3>
      <p className="text-sm text-muted-foreground">
        查看此工作区当前纳入 FoKn 上下文的知识，无需调用模型。过期、已否定或移除的内容不会列入。
        协作者与单元格各自拥有独立知识；这里不表示完整的模型请求。
      </p>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={busy || visible.status === 'loading'}
        onClick={() => void read()}
      >
        {visible.status === 'loading' ? '正在读取研究知识' : '查看研究知识'}
      </button>
      {visible.status === 'error' && <p role="alert">{visible.message}</p>}
      {snapshot && (
        <>
          <p className="text-sm">
            读取时修订 {snapshot.revision} · {snapshot.agent} ·{' '}
            {groups.reduce((n, group) => n + group.claims.length, 0)} 条知识
          </p>
          <p className="text-sm text-muted-foreground">
            待验证内容仍是候选描述；已支持只表示其附带断言或计算通过，不代表普遍事实。
          </p>
          {groups.length === 0 && (
            <p className="text-sm">当前没有纳入上下文的知识。历史证据仍可在研究结果中查看。</p>
          )}
          {groups.map(({ area, tree, claims }) => (
            <div key={JSON.stringify([area, tree])} className="space-y-2">
              <h4 className="text-sm font-medium">
                {area} / {tree}
              </h4>
              <ul className="space-y-2">
                {claims.map((claim) => (
                  <li key={claim.id} className="rounded border p-3 text-sm">
                    <details>
                      <summary>
                        {claim.status === 'supported' ? '已支持' : '待验证'} · {claim.text}
                      </summary>
                      <p className="break-all">
                        记录者：{claim.source.agent} · 调用 {claim.source.invocation} · 步骤{' '}
                        {claim.source.call_id}
                      </p>
                      <pre className="overflow-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(claim, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <details>
            <summary className="text-sm">完整知识快照</summary>
            <pre
              aria-label="完整知识快照 JSON"
              className="overflow-auto whitespace-pre-wrap break-all text-xs"
            >
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
