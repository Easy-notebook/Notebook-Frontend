import { useState } from 'react';
import { SkillReviewClient, type ReviewSelection } from '@Services/native-study/SkillReviewClient';
import type { SkillModel } from '@Services/native-study/SkillModelClient';
import { useScopedNativeRead } from './useScopedNativeRead';
/** Preview one explicit package selection; rendering or inspecting never grants tools. */
export function SkillReviewPreview({
  notebookId,
  workspace,
  revision,
  lock,
  resource,
  busy,
  onPrepare,
  prepareDisabled = true,
}: {
  notebookId: string;
  workspace: string;
  revision: number;
  lock: unknown;
  resource: SkillModel;
  busy: boolean;
  onPrepare?: (selection: ReviewSelection) => void;
  prepareDisabled?: boolean;
}) {
  const [includeReference, setIncludeReference] = useState(false);
  const [path, setPath] = useState('');
  const [identity, setIdentity] = useState('');
  const selection: ReviewSelection = {
    source: resource.source,
    location: resource.location,
    content_hash: resource.content_hash,
    model_path: resource.path,
    reference: includeReference ? { path, expected_id: identity } : null,
  };
  const scope = JSON.stringify([notebookId, workspace, revision, selection]);
  const { state, read } = useScopedNativeRead(scope, busy, (signal) =>
    new SkillReviewClient(notebookId).inspect(workspace, revision, lock, selection, signal)
  );
  return (
    <section aria-label="技能工具预览" className="space-y-3 rounded border p-3">
      <h4 className="font-semibold">检查房屋技能的工具范围</h4>
      <p className="text-sm">
        预览读取 CSV 概况和使用所选模型分群的工具绑定；不授权执行、不调用 LLM。
      </p>
      <label className="block">
        <input
          type="checkbox"
          checked={includeReference}
          disabled={busy}
          onChange={(e) => setIncludeReference(e.target.checked)}
        />{' '}
        包含参考样本比较工具
      </label>
      {includeReference && (
        <>
          <label className="block">
            技能包内参考 CSV 路径
            <input
              className="block w-full rounded border p-2"
              value={path}
              disabled={busy}
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          <label className="block">
            技能参考身份
            <input
              className="block w-full rounded border p-2"
              value={identity}
              disabled={busy}
              onChange={(e) => setIdentity(e.target.value)}
            />
          </label>
        </>
      )}
      <button
        type="button"
        className="rounded border px-3 py-2 disabled:opacity-50"
        disabled={
          busy ||
          state.status === 'loading' ||
          (includeReference && (!path.trim() || !identity.trim()))
        }
        onClick={() => void read()}
      >
        检查技能工具绑定
      </button>
      {state.status === 'loading' && <p role="status">正在核对冻结资源…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <div aria-label="已核对技能工具">
          <p className="text-sm">资源与绑定已核对；尚未授权执行。</p>
          {state.value.tools.length === 0 && <p>技能声明未开放所选数值工具。</p>}
          <ul>
            {state.value.tools.map((tool) => (
              <li key={tool.name}>
                {
                  {
                    profile: '读取 CSV 概况',
                    assign: '使用冻结模型分群',
                    similar: '比较冻结参考样本',
                  }[tool.name]
                }
                <details>
                  <summary>查看工具绑定</summary>
                  <pre className="overflow-auto text-xs">{JSON.stringify(tool, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
          {onPrepare && (
            <button
              type="button"
              disabled={busy || prepareDisabled}
              onClick={() => onPrepare(state.value.selection)}
            >
              保存本次技能调用供审批
            </button>
          )}
          <details>
            <summary>查看编译内容标识</summary>
            <p className="break-all text-xs">{state.value.artifact_fingerprint}</p>
          </details>
        </div>
      )}
    </section>
  );
}
