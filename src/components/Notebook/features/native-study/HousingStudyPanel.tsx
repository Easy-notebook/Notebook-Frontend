import { ImportedModel } from './ImportedModel';
import { useEffect, useRef, useState } from 'react';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { NativeStudySession, type StudySnapshot } from '@Services/native-study/NativeStudySession';
import { publishStudy } from '@Services/native-study/publishStudy';
import {
  publishComparisonCell,
  publishEvidenceCell,
  publishComparisonWorkflow,
} from '@Services/native-study/publishComparisonCell';
import { StudyEvidence } from './StudyEvidence';
import { NativeDatasetPicker } from './NativeDatasetPicker';
import { StudyProgress } from './StudyProgress';
import { StudyDiscussion } from './StudyDiscussion';
import { StudyKnowledge } from './StudyKnowledge';
import { StudyFigure } from './StudyFigure';
import { StudyProcedures } from './StudyProcedures';

const inputClass = 'block w-full rounded border bg-background px-3 py-2 text-sm';
const buttonClass = 'rounded border px-3 py-2 text-sm disabled:opacity-50';
export function HousingStudyPanel({ notebookId }: { notebookId: string }) {
  const session = useRef<NativeStudySession | null>(null);
  const publication = useRef<AbortController | null>(null);
  const renderedOwner = useRef(notebookId);
  renderedOwner.current = notebookId;
  const [state, setState] = useState<StudySnapshot>({
    status: 'disconnected',
    view: null,
    error: null,
    pending: false,
    progress: null,
  });
  const [csv, setCsv] = useState('');
  const [columns, setColumns] = useState('area\nrooms');
  const [clusters, setClusters] = useState(3);
  const [query, setQuery] = useState('');
  const [neighbors, setNeighbors] = useState(3);
  const [evidenceRow, setEvidenceRow] = useState(0);
  const [maximum, setMaximum] = useState(0.001);
  const [goal, setGoal] = useState('保留距离平方不超过指定上限的房屋近邻，保持原始排序。');
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [datasetBusy, setDatasetBusy] = useState(false);
  useEffect(() => {
    let runtime: NativeStudySession;
    try {
      runtime = new NativeStudySession(new NativeStudyClient(notebookId));
    } catch (error) {
      setNotice(String(error));
      return;
    }
    session.current = runtime;
    loadedInput.current = undefined;
    setCsv('');
    setQuery('');
    setEvidenceRow(0);
    setNotice('');
    setPublishing(false);
    const unsubscribe = runtime.subscribe(() => setState(runtime.getSnapshot()));
    setState(runtime.getSnapshot());
    queueMicrotask(() => {
      if (session.current === runtime) void runtime.refresh();
    });
    return () => {
      unsubscribe();
      publication.current?.abort();
      publication.current = null;
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
  const selectedColumns = columns
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const savedParameters = savedInput?.configuration.parameters as
    | { columns?: unknown; clusters?: unknown }
    | undefined;
  const inputChanged =
    !!savedInput &&
    ((csv || savedInput.configuration.csv) !== savedInput.configuration.csv ||
      JSON.stringify(selectedColumns) !== JSON.stringify(savedParameters?.columns) ||
      clusters !== savedParameters?.clusters);
  const validEvidenceRow = Number.isInteger(evidenceRow) && evidenceRow >= 0 && evidenceRow <= 127;
  const run = (
    ability: Parameters<NativeStudySession['execute']>[0],
    args: Record<string, unknown>
  ) => void session.current?.execute(ability, args);
  const insert = async (kind: 'snapshot' | 'comparison' | 'shared' | 'evidence') => {
    if (
      !view ||
      view.frontend_notebook_id !== notebookId ||
      busy ||
      datasetBusy ||
      publication.current
    )
      return;
    if (
      kind !== 'snapshot' &&
      (closed || inputChanged || !savedInput || (kind === 'comparison' && !view.study.current))
    )
      return;
    if (kind === 'evidence' && !validEvidenceRow) return;
    const owner = session.current;
    const attempt = new AbortController();
    publication.current = attempt;
    const active = () =>
      owner === session.current && renderedOwner.current === notebookId && !attempt.signal.aborted;
    setPublishing(true);
    setNotice('');
    try {
      if (kind !== 'snapshot') {
        await (
          kind === 'shared'
            ? publishComparisonWorkflow
            : kind === 'evidence'
              ? publishEvidenceCell
              : publishComparisonCell
        )(
          notebookId,
          {
            referenceCsv: savedInput!.configuration.csv,
            queryCsv: query,
            columns: selectedColumns,
            clusters,
            neighbors,
            ...(kind === 'evidence' ? { queryRow: evidenceRow } : {}),
          },
          attempt.signal
        );
      } else {
        await publishStudy(view, notebookId, attempt.signal);
      }
      if (active())
        setNotice(
          kind === 'shared'
            ? '已保存拟合与比较两个 AAL 单元格。先运行拟合单元格，再运行比较；后续比较可复用已保存的参考模型。'
            : kind === 'evidence'
              ? `已保存 FoKn 样本证据单元格。运行后查看查询行 ${evidenceRow} 的测量事实与推导图。`
              : kind === 'comparison'
                ? '已保存 AAL 相似样本单元格。关闭研究面板后运行，可查看近邻及各特征的距离贡献。'
                : '已写入并保存当前笔记，作为本次研究快照。'
        );
    } catch (error) {
      if (active()) setNotice(String(error));
    } finally {
      if (publication.current === attempt) {
        publication.current = null;
        if (active()) setPublishing(false);
      }
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
          disabled={publishing || state.status === 'running' || state.status === 'loading'}
          onClick={() => void session.current?.refresh()}
        >
          刷新研究
        </button>
      </div>
      <StudyProgress progress={state.progress} />
      <StudyProcedures
        key={`procedures:${notebookId}`}
        procedures={
          view?.frontend_notebook_id === notebookId
            ? [...(view.study.procedures ?? []), ...(view.study.observed_procedures ?? [])]
            : []
        }
        disabled={
          busy || closed || publishing || datasetBusy || view?.frontend_notebook_id !== notebookId
        }
        canSave={!!view?.study.current && !!view.study.comparison && !inputChanged}
        hasInputs={!!(csv || savedInput?.configuration.csv)?.trim() && !!query.trim()}
        onSave={(name) => run('save_study_procedure', { name })}
        onReuse={(name, origin) =>
          run('reuse_study_procedure', {
            name,
            ...(origin === 'observed' ? { origin } : {}),
            csv: csv || savedInput?.configuration.csv,
            query,
          })
        }
      />
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      {publishing && <p role="status">正在保存研究单元格…</p>}
      {notice && <p role="status">{notice}</p>}
      {state.pending && (
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            disabled={publishing || state.status === 'running' || state.status === 'loading'}
            onClick={() => void session.current?.retry()}
          >
            重试原操作
          </button>
          <button
            className={buttonClass}
            disabled={publishing || state.status === 'running' || state.status === 'loading'}
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
              columns: selectedColumns,
              clusters,
            },
          });
        }}
      >
        <fieldset disabled={busy || closed || datasetBusy || publishing} className="space-y-3">
          <legend className="font-semibold">1. 房屋研究输入</legend>
          <NativeDatasetPicker
            notebookId={notebookId}
            disabled={busy || closed || publishing}
            onBusyChange={setDatasetBusy}
            columns={selectedColumns}
            clusters={clusters}
            onSelect={(text) => {
              setCsv(text);
              setNotice('已从 Rust 文件版本读入 CSV，请保存研究输入。');
            }}
          />
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
          {inputChanged && (
            <p role="status" className="text-sm">
              当前输入尚未保存。请先保存再执行；下方结果仍对应上次保存的输入。
            </p>
          )}
          <button className={buttonClass} type="submit" disabled={!csv && !view?.study.input}>
            保存研究输入
          </button>{' '}
          <button
            className={buttonClass}
            type="button"
            disabled={!view?.study.input || inputChanged}
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
        <fieldset disabled={busy || closed || datasetBusy || publishing} className="space-y-3">
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
          <button
            className={buttonClass}
            type="submit"
            disabled={inputChanged || !view?.study.current}
          >
            比较并解释相似样本
          </button>
          <button
            className={buttonClass}
            type="button"
            disabled={
              !query.trim() ||
              !(csv || savedInput?.configuration.csv)?.trim() ||
              selectedColumns.length === 0 ||
              new Set(selectedColumns).size !== selectedColumns.length ||
              selectedColumns.length > 16 ||
              !Number.isInteger(clusters) ||
              clusters < 2 ||
              clusters > 16 ||
              !Number.isInteger(neighbors) ||
              neighbors < 1 ||
              neighbors > 8
            }
            onClick={() =>
              run('learn_study', {
                csv: csv || savedInput?.configuration.csv,
                query,
                parameters: { columns: selectedColumns, clusters },
                neighbors,
              })
            }
          >
            分群、比较并学习
          </button>
          <p className="text-xs text-muted-foreground">
            使用当前填写的参考与新样本 CSV、特征和数值参数，重新分群并保存第一条查询的 FoKn 证据。
            全部完成后自动保存可复用技能；已完成步骤会保留，失败后可重试原操作。
          </p>
          <button
            className={buttonClass}
            type="button"
            disabled={!query.trim() || inputChanged || !view?.study.current}
            onClick={() => void insert('comparison')}
          >
            插入 AAL 相似样本单元格
          </button>
          <button
            className={buttonClass}
            type="button"
            disabled={!query.trim() || inputChanged || !savedInput}
            onClick={() => void insert('shared')}
          >
            插入可复用的拟合与比较单元格
          </button>
          <label className="block text-sm">
            证据样本行（从 0 开始）
            <input
              className={inputClass}
              type="number"
              min={0}
              max={127}
              step={1}
              value={Number.isNaN(evidenceRow) ? '' : evidenceRow}
              onChange={(event) => setEvidenceRow(event.target.valueAsNumber)}
            />
          </label>
          <button
            className={buttonClass}
            type="button"
            disabled={!query.trim() || inputChanged || !savedInput || !validEvidenceRow}
            onClick={() => void insert('evidence')}
          >
            插入 FoKn 样本证据单元格
          </button>
          <p className="text-xs text-muted-foreground">
            证据单元格重新计算所选查询行的近邻，并生成事实与同群推导图。行号不含表头，执行时检查是否存在；每行可分别保存独立结果。
          </p>
          <p className="text-xs text-muted-foreground">
            拆分后先运行拟合，再运行比较。参考模型仅在成功时保存，可供本笔记后续新样本比较复用。
          </p>
          <p className="text-xs text-muted-foreground">
            将已保存的参考输入、当前新样本 CSV
            和近邻数量固定为文件版本，运行单元格时重新计算解释。重复插入同一配置不会新增单元格。
          </p>
        </fieldset>
      </form>
      {view?.generated_selection_enabled && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run('select_study', { goal, maximum });
          }}
        >
          <fieldset disabled={busy || closed || publishing || datasetBusy} className="space-y-3">
            <legend className="font-semibold">3. PCS 研究规划与筛选</legend>
            <label className="block">
              研究或筛选目标
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
              筛选支持最多 8 个查询样本。模型可复用或修订筛选能力，执行检查通过后保存。
            </p>
            <button
              className={buttonClass}
              type="submit"
              disabled={!view.study.comparison || view.study.comparison.rows.length > 8}
            >
              规划并执行筛选
            </button>
            <button
              className={buttonClass}
              type="button"
              disabled={
                !query.trim() ||
                !(csv || savedInput?.configuration.csv)?.trim() ||
                !goal.trim() ||
                !Number.isFinite(maximum) ||
                maximum < 0 ||
                !Number.isInteger(neighbors) ||
                neighbors < 1 ||
                neighbors > 8
              }
              onClick={() =>
                run('auto_study_task', {
                  goal,
                  csv: csv || savedInput?.configuration.csv,
                  query_csv: query,
                  neighbors,
                  maximum,
                })
              }
            >
              由 PCS 规划并执行完整研究
            </button>
            <p className="text-sm text-muted-foreground">
              完整研究使用当前参考和新样本 CSV，由 PCS 选择特征与分群数，再安排比较、单个样本的 FoKn
              证据保存、可选筛选和分群图。比较之后可按目标安排这些步骤的顺序，例如先画图再保存证据。上方手动特征配置不约束
              PCS；需要的特征请写入目标。已完成步骤会保存，失败后可重试原操作。
            </p>
          </fieldset>
        </form>
      )}
      {view?.frontend_notebook_id === notebookId && (
        <ImportedModel
          key={`${notebookId}:${view.document.id}`}
          notebookId={notebookId}
          workspace={view.document.id}
          revision={view.document.revision}
          busy={busy || closed || publishing || datasetBusy}
          modelEnabled={view.model_enabled}
        />
      )}
      {view && (
        <StudyEvidence
          notebookId={notebookId}
          view={view}
          busy={busy || closed || publishing}
          modelExportDisabled={inputChanged || datasetBusy}
          explain={(row) => run('explain_study_sample', { query_row: row })}
        />
      )}
      {view?.frontend_notebook_id === notebookId &&
        view.study.current &&
        view.study.result?.kind === 'mining' && (
          <StudyFigure
            key={JSON.stringify([
              notebookId,
              view.document.id,
              view.document.revision,
              view.study.result.report.reference_id,
            ])}
            notebookId={notebookId}
            workspace={view.document.id}
            revision={view.document.revision}
            reference={view.study.result.report.reference_id}
            savedFigure={view.study.figure}
            features={view.study.result.report.model.features.map((feature) => feature.name)}
            busy={busy || publishing || datasetBusy || inputChanged}
          />
        )}
      {view?.frontend_notebook_id === notebookId && (
        <StudyKnowledge
          notebookId={notebookId}
          workspace={view.document.id}
          revision={view.document.revision}
          busy={busy || publishing || datasetBusy}
        />
      )}
      {view?.frontend_notebook_id === notebookId && (
        <StudyDiscussion
          key={notebookId}
          view={view}
          busy={busy || publishing || datasetBusy}
          inputChanged={inputChanged}
          execute={run}
        />
      )}
      <button
        type="button"
        className={buttonClass}
        disabled={busy || publishing || datasetBusy || !view?.study.current}
        onClick={() => void insert('snapshot')}
      >
        写入当前笔记
      </button>
    </div>
  );
}
