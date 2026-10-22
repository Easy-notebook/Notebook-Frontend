import { ComparisonEvidence } from './ComparisonEvidence';
import { useState } from 'react';
import { downloadBlob } from '@Services/notebook/BrowserDownload';
import { studyModelExport } from '@Services/native-study/studyModel';
import type { NativeView } from '@Services/native-study/contracts';
import { SampleEvidence } from './SampleEvidence';

const number = (value: number) => value.toPrecision(6);
export function StudyEvidence({
  view,
  busy,
  explain,
  modelExportDisabled = false,
}: {
  view: NativeView;
  busy: boolean;
  modelExportDisabled?: boolean;
  explain: (row: number) => void;
}) {
  const study = view.study;
  const [exportError, setExportError] = useState('');
  const exportModel = () => {
    setExportError('');
    try {
      downloadBlob(
        new Blob([studyModelExport(view)], { type: 'application/json' }),
        'mining-model.json'
      );
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <div className="space-y-4">
      {study.result && (
        <section aria-label="分群结果">
          <h3 className="font-semibold">{study.result.report.clusters.length} 个房屋特征分群</h3>
          <p>
            平均轮廓系数 {number(study.result.report.mean_silhouette)} · 簇内平方距离{' '}
            {number(study.result.report.inertia)}
          </p>
          <p className="text-sm text-muted-foreground">
            这些指标描述当前数据，不证明自然类别、房价或因果关系。所有样本行号从零开始。
          </p>
          <p className="text-sm break-all">
            参考身份：<code>{study.result.report.reference_id}</code>
          </p>
          <button
            type="button"
            disabled={busy || modelExportDisabled || !study.current}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            onClick={exportModel}
          >
            导出冻结分群模型
          </button>
          <p className="text-sm text-muted-foreground">
            包含特征缩放和分群中心，可供 Rust
            离线分群；不包含逐行参考样本，不能单独用于相似样本解释。
          </p>
          {exportError && <p role="alert">{exportError}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>分群</th>
                <th>样本数</th>
                <th>代表样本行</th>
              </tr>
            </thead>
            <tbody>
              {study.result.report.clusters.map((c) => (
                <tr key={c.cluster}>
                  <td>{c.cluster}</td>
                  <td>{c.count}</td>
                  <td>{c.representative_row}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {study.comparison && (
        <ComparisonEvidence comparison={study.comparison} busy={busy} explain={explain} />
      )}
      {view.study_selection && (
        <section aria-label="筛选结果">
          <h3 className="font-semibold">{view.study_selection.plan.title}</h3>
          <p>
            {view.study_selection.execution.checked_cases} 项检查通过 · 距离平方上限{' '}
            {number(view.study_selection.adoption.maximum)}
          </p>
          <ul>
            {view.study_selection.execution.selection.map((row) => (
              <li key={row.query_row}>
                查询样本 {row.query_row}：保留参考行 {row.selected_rows.join(', ') || '无'}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            检查只覆盖已测样本与边界用例，不证明所有输入的正确性。
          </p>
        </section>
      )}
      {!!study.practice && (
        <details>
          <summary>分群测量证据</summary>
          <pre className="text-xs overflow-auto max-h-64">
            {JSON.stringify(study.practice, null, 2)}
          </pre>
        </details>
      )}
      {study.sample_evidence && <SampleEvidence evidence={study.sample_evidence} />}
    </div>
  );
}
