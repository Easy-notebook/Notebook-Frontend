import type { ReviewSnapshot } from '@Services/native-study/SkillReviewSession';
/** Server approval and execution are separate explicit actions; retries retain their identity. */
export function SkillReviewExecution({
  state,
  revision,
  disabled,
  onDecide,
  onExecute,
  onResume,
  onClear,
}: {
  state: ReviewSnapshot;
  revision: number;
  disabled: boolean;
  onDecide: (approve: boolean) => void;
  onExecute: () => void;
  onResume: () => void;
  onClear: () => void;
}) {
  const record = state.record;
  const stale = !!record && record.input.revision !== revision;
  const busy = disabled || state.busy || state.blocked || stale;
  return (
    <section aria-label="技能审批与执行" className="space-y-3 rounded border p-3">
      <h4 className="font-semibold">本次技能调用</h4>
      <p className="text-sm">
        批准只适用于已保存的输入和工具绑定。执行会调用当前服务配置的模型；结果不自动写入研究结论。
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      {stale && (
        <p role="alert">
          工作区版本已变化，当前接口不能继续此调用。已保存的输入保留，不会自动生成新调用。
        </p>
      )}
      {!record && !state.blocked && <p>先检查技能工具绑定，再保存本次调用供审批。</p>}
      {record && (
        <>
          <p className="break-all text-xs">调用标识：{record.input.invocation}</p>
          <details>
            <summary>查看本次冻结输入</summary>
            <pre className="overflow-auto text-xs">{record.input.csv}</pre>
            <p className="break-all text-xs">
              模型：{record.input.selection.model_path} · 内容：
              {record.input.selection.content_hash}
            </p>
            {record.input.selection.reference && (
              <p className="break-all text-xs">
                参考：{record.input.selection.reference.path} ·{' '}
                {record.input.selection.reference.expected_id}
              </p>
            )}
          </details>
          {record.preview && (
            <details>
              <summary>查看服务器核对的工具范围</summary>
              <pre className="overflow-auto text-xs">{JSON.stringify(record.preview, null, 2)}</pre>
            </details>
          )}
          {state.busy && <p role="status">正在处理本次技能调用…</p>}
          {['request', 'decision', 'execute'].includes(record.phase) && !state.busy && (
            <button type="button" disabled={busy} onClick={onResume}>
              恢复本次操作（复用原调用）
            </button>
          )}
          {record.phase === 'ready' && record.approval?.state.status === 'pending' && (
            <>
              <p>等待对本次冻结调用作出决定。</p>
              <button type="button" disabled={busy} onClick={() => onDecide(true)}>
                批准本次技能调用
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide(false)}>
                拒绝本次技能调用
              </button>
            </>
          )}
          {record.phase === 'ready' && record.approval?.state.status === 'approved' && (
            <button type="button" disabled={busy} onClick={onExecute}>
              执行已批准的技能调用
            </button>
          )}
          {record.approval?.state.status === 'denied' && <p>本次调用已拒绝，不会执行。</p>}
          {record.phase === 'completed' && (
            <div aria-label="技能执行结果">
              <p className="whitespace-pre-wrap">{record.result}</p>
            </div>
          )}
          {(record.phase === 'completed' || record.approval?.state.status === 'denied') && (
            <button type="button" disabled={state.busy || state.blocked} onClick={onClear}>
              清除本地记录，准备另一调用
            </button>
          )}
        </>
      )}
    </section>
  );
}
