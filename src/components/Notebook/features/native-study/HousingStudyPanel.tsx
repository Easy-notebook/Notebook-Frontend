import { useEffect, useRef, useState } from 'react';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { NativeStudySession, type StudySnapshot } from '@Services/native-study/NativeStudySession';
import { publishStudy } from '@Services/native-study/publishStudy';
import { StudyEvidence } from './StudyEvidence';

const inputClass = 'block w-full rounded border bg-background px-3 py-2 text-sm';
const buttonClass = 'rounded border px-3 py-2 text-sm disabled:opacity-50';
export function HousingStudyPanel({ notebookId }: { notebookId: string }) {
  const session = useRef<NativeStudySession | null>(null);
  const [state, setState] = useState<StudySnapshot>({
    status: 'disconnected',
    view: null,
    error: null,
    pending: false,
  });
  const [csv, setCsv] = useState('');
  const [columns, setColumns] = useState('area\nrooms');
  const [clusters, setClusters] = useState(3);
  const [query, setQuery] = useState('');
  const [neighbors, setNeighbors] = useState(3);
  const [maximum, setMaximum] = useState(0.001);
  const [goal, setGoal] = useState('保留距离平方不超过指定上限的房屋近邻，保持原始排序。');
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    let runtime: NativeStudySession;
    try {
      runtime = new NativeStudySession(new NativeStudyClient(notebookId));
    } catch (error) {
      setNotice(String(error));
      return;
    }
    session.current = runtime;
    const unsubscribe = runtime.subscribe(() => setState(runtime.getSnapshot()));
    setState(runtime.getSnapshot());
    queueMicrotask(() => {
      if (session.current === runtime) void runtime.refresh();
    });
    return () => {
      unsubscribe();
      runtime.dispose();
      if (session.current === runtime) session.current = null;
    };
  }, [notebookId]);
  const loadedInput = useRef<number | undefined>(undefined);
  const savedInput = state.view?.study.input;
  useEffect(() => {
    if (!savedInput || loadedInput.current === savedInput.revision) return;
    loadedInput.current = savedInput.revision;
    setCsv(savedInput.configuration.csv);
    const parameters = savedInput.configuration.parameters as {
      columns?: unknown;
      clusters?: unknown;
    };
    if (
      Array.isArray(parameters?.columns) &&
      parameters.columns.every((item) => typeof item === 'string')
    )
      setColumns(parameters.columns.join('\n'));
    if (typeof parameters?.clusters === 'number') setClusters(parameters.clusters);
  }, [savedInput]);
  const busy = state.status !== 'ready';
  const view = state.view;
  const closed = view?.document.notebook.status !== 'Open';
  const run = (
    ability: Parameters<NativeStudySession['execute']>[0],
    args: Record<string, unknown>
  ) => void session.current?.execute(ability, args);
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setNotice('CSV 不能超过 4 MiB');
      return;
    }
    const owner = session.current;
    try {
      const text = await file.text();
      if (owner === session.current) {
        setCsv(text);
        setNotice('已读入 CSV，请保存研究输入。');
      }
    } catch (error) {
      if (owner === session.current) setNotice(String(error));
    }
  };
  const insert = async () => {
    if (!view || publishing) return;
    const owner = session.current;
    setPublishing(true);
    try {
      await publishStudy(view, notebookId);
      if (owner === session.current) setNotice('已写入并保存当前笔记，作为本次研究快照。');
    } catch (error) {
      if (owner === session.current) setNotice(String(error));
    } finally {
      if (owner === session.current) setPublishing(false);
    }
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        选择数值特征进行分群，再用冻结参考数据解释新房屋样本。数据与研究结果按当前笔记独立保存。
      </p>
      <div className="flex gap-2 items-center">
        <span role="status">
          {
            {
              disconnected: '尚未连接',
              loading: '正在读取研究',
              ready: '研究已就绪',
              running: '正在执行研究',
              recoverable: '上次操作待处理',
            }[state.status]
          }
          {view ? ` · 修订 ${view.document.revision}` : ''}
        </span>
        <button
          className={buttonClass}
          type="button"
          disabled={state.status === 'running' || state.status === 'loading'}
          onClick={() => void session.current?.refresh()}
        >
          刷新研究
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {state.pending && (
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            disabled={state.status === 'running' || state.status === 'loading'}
            onClick={() => void session.current?.retry()}
          >
            重试原操作
          </button>
          <button
            className={buttonClass}
            disabled={state.status === 'running' || state.status === 'loading'}
            onClick={() => void session.current?.discardRetry()}
          >
            放弃重试并刷新
          </button>
          <p className="text-sm">重试保留原请求编号。关闭页面不会撤销已经执行的步骤。</p>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run('configure_study', {
            kind: 'mining',
            csv: csv || view?.study.input?.configuration.csv,
            parameters: {
              columns: columns
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              clusters,
            },
          });
        }}
      >
        <fieldset disabled={busy || closed} className="space-y-3">
          <legend className="font-semibold">1. 房屋研究输入</legend>
          <label className="block">
            参考数据 CSV
            <input
              aria-label="参考数据 CSV 文件"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          <label className="block">
            参考 CSV 内容
            <textarea
              className={inputClass}
              rows={4}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder="area,rooms"
            />
          </label>
          <label className="block">
            数值特征（每行一个）
            <textarea
              className={inputClass}
              rows={2}
              required
              value={columns}
              onChange={(event) => setColumns(event.target.value)}
            />
          </label>
          <label className="block">
            分群数量
            <input
              className={inputClass}
              type="number"
              min={2}
              max={16}
              required
              value={clusters}
              onChange={(event) => setClusters(Number(event.target.value))}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            最多 2,000 行、16 个特征；缺失值需先处理。保存新输入后，旧结果失效。
            {view?.study.input ? '已保存研究输入；留空 CSV 可沿用已保存数据。' : ''}
          </p>
          <button className={buttonClass} type="submit" disabled={!csv && !view?.study.input}>
            保存研究输入
          </button>{' '}
          <button
            className={buttonClass}
            type="button"
            disabled={!view?.study.input}
            onClick={() => run('run_study', {})}
          >
            执行房屋分群
          </button>
        </fieldset>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run('compare_study', { csv: query, neighbors });
        }}
      >
        <fieldset disabled={busy || closed || !view?.study.current} className="space-y-3">
          <legend className="font-semibold">2. 比较新房屋样本</legend>
          <label className="block">
            新样本 CSV
            <textarea
              className={inputClass}
              rows={4}
              required
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={'area,rooms\n42.5,2\n182,7'}
            />
          </label>
          <label className="block">
            每行近邻数量
            <input
              className={inputClass}
              type="number"
              min={1}
              max={8}
              required
              value={neighbors}
              onChange={(event) => setNeighbors(Number(event.target.value))}
            />
          </label>
          <button className={buttonClass} type="submit">
            比较并解释相似样本
          </button>
        </fieldset>
      </form>
      {view?.generated_selection_enabled && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run('select_study', { goal, maximum });
          }}
        >
          <fieldset
            disabled={
              busy || closed || !view.study.comparison || view.study.comparison.rows.length > 8
            }
            className="space-y-3"
          >
            <legend className="font-semibold">3. 按距离筛选近邻</legend>
            <label className="block">
              筛选目标
              <textarea
                className={inputClass}
                required
                maxLength={8192}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </label>
            <label className="block">
              距离平方上限
              <input
                className={inputClass}
                type="number"
                min={0}
                step="any"
                required
                value={maximum}
                onChange={(event) => setMaximum(Number(event.target.value))}
              />
            </label>
            <p className="text-sm">
              支持最多 8 个查询样本。模型可复用或修订筛选能力，执行检查通过后保存。
            </p>
            <button className={buttonClass}>规划并执行筛选</button>
          </fieldset>
        </form>
      )}
      {view && (
        <StudyEvidence
          view={view}
          busy={busy || closed}
          explain={(row) => run('explain_study_sample', { query_row: row })}
        />
      )}
      <button
        type="button"
        className={buttonClass}
        disabled={busy || publishing || !view?.study.current}
        onClick={() => void insert()}
      >
        写入当前笔记
      </button>
    </div>
  );
}
