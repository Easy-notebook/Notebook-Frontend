import { useEffect, useRef, useState } from 'react';
import {
  WorkflowDesignClient,
  type WorkflowContext,
} from '@Services/native-study/WorkflowDesignClient';
import {
  WorkflowDesignSession,
  type WorkflowSnapshot,
} from '@Services/native-study/WorkflowDesignSession';

export function WorkflowDesigner({
  notebookId,
  context,
  disabled,
}: {
  notebookId: string;
  context: Omit<WorkflowContext, 'invocation'>;
  disabled: boolean;
}) {
  const scope = JSON.stringify([notebookId, context.workspace, context.expected_revision]);
  const session = useRef<WorkflowDesignSession | null>(null);
  const [owned, setOwned] = useState<{ scope: string; state: WorkflowSnapshot } | null>(null);
  const [goal, setGoal] = useState('筛选指定距离内的房屋近邻，并汇总数量，保留测量标识。');
  const [name, setName] = useState('HousingWorkflow');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const current = new WorkflowDesignSession(
      new WorkflowDesignClient(notebookId),
      context.workspace,
      context.expected_revision
    );
    session.current = current;
    const update = () => setOwned({ scope, state: current.getSnapshot() });
    update();
    const unsubscribe = current.subscribe(update);
    return () => {
      unsubscribe();
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, [notebookId, context.workspace, context.expected_revision, scope]);
  const state = owned?.scope === scope ? owned.state : null;
  const record = state?.record;
  const result = record?.continuationResult ?? record?.result;
  const fingerprint = record?.draft?.draft.checked.fingerprint;
  useEffect(() => setConfirmed(false), [scope, fingerprint]);
  const unavailable = disabled || !state || state.busy || state.blocked;
  const button = 'rounded border px-3 py-2 text-sm disabled:opacity-50';
  return (
    <section aria-label="生成原生工作流" className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">生成并审阅房屋工作流</h3>
      <p className="text-sm">
        生成草稿会调用模型。代码由 Rust 编译，审阅后另行执行；输出不会自动写入研究结论。
      </p>
      {state?.error && <p role="alert">{state.error}</p>}
      {!record && (
        <>
          <label className="block">
            工作流目标
            <textarea
              aria-label="工作流目标"
              className="block w-full rounded border p-2"
              value={goal}
              disabled={unavailable}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <label className="block">
            工作流类名
            <input
              aria-label="工作流类名"
              className="block w-full rounded border p-2"
              value={name}
              disabled={unavailable}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={button}
            disabled={
              unavailable ||
              !goal.trim() ||
              !name.trim() ||
              !context.reference_csv.trim() ||
              !context.query_csv.trim()
            }
            onClick={() => void session.current?.prepare({ ...context, goal, name })}
          >
            生成工作流草稿
          </button>
        </>
      )}
      {record && (
        <>
          <p className="break-all text-xs">
            输入版本：{record.input.expected_revision} · 草稿操作：{record.input.invocation}
          </p>
          <details>
            <summary>查看冻结的任务输入</summary>
            <pre className="max-h-64 overflow-auto text-xs">
              {JSON.stringify(record.input, null, 2)}
            </pre>
          </details>
          {record.draft && (
            <>
              <p className="break-all text-xs">编译指纹：{fingerprint}</p>
              <pre
                aria-label="工作流源码"
                className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs"
              >
                {record.draft.draft.source}
              </pre>
              <details>
                <summary>查看公开接口</summary>
                <pre className="overflow-auto text-xs">
                  {JSON.stringify(record.draft.draft.inspection.public, null, 2)}
                </pre>
              </details>
            </>
          )}
          {state?.busy && <p role="status">正在处理工作流操作…</p>}
          {['drafting', 'executing', 'continuing'].includes(record.phase) && !state?.busy && (
            <button
              type="button"
              className={button}
              disabled={unavailable}
              onClick={() => void session.current?.resume()}
            >
              恢复原工作流操作
            </button>
          )}
          {record.phase === 'review' && (
            <>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={unavailable}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我已查看源码和冻结输入，确认执行此版本
              </label>
              <button
                type="button"
                className={button}
                disabled={unavailable || !confirmed || !fingerprint}
                onClick={() => {
                  if (confirmed && fingerprint) void session.current?.execute(fingerprint);
                }}
              >
                执行已审阅工作流
              </button>
            </>
          )}
          {record.phase === 'suspended' && (
            <>
              <p role="status">工作流已挂起。继续会重新检查等待条件，并使用原来的代码和输入。</p>
              <button
                type="button"
                className={button}
                disabled={unavailable}
                onClick={() => void session.current?.continue()}
              >
                继续挂起工作流
              </button>
            </>
          )}
          {result && (
            <details open>
              <summary>
                工作流执行结果（{record.phase === 'completed' ? '已完成' : '已挂起'}）
              </summary>
              <pre aria-label="工作流执行结果" className="max-h-96 overflow-auto text-xs">
                {JSON.stringify(result.result.execution, null, 2)}
              </pre>
            </details>
          )}
          {['review', 'completed'].includes(record.phase) && (
            <button
              type="button"
              className={button}
              disabled={unavailable}
              onClick={() => {
                session.current?.clear();
                setName(`HousingWorkflow_${crypto.randomUUID().replace(/-/g, '')}`);
                setConfirmed(false);
              }}
            >
              清除本地记录，准备新草稿
            </button>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        本标签页保存操作记录；刷新后请主动恢复。工作区版本变化后使用独立记录，旧版本操作不会自动继续。
      </p>
    </section>
  );
}
