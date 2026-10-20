import type { NativeView } from '@Services/native-study/contracts';

const number = (value: number) => value.toPrecision(6);
export function StudyEvidence({
  view,
  busy,
  explain,
}: {
  view: NativeView;
  busy: boolean;
  explain: (row: number) => void;
}) {
  const study = view.study;
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
        <section aria-label="相似样本解释">
          <h3 className="font-semibold">相似样本与逐特征距离</h3>
          {study.comparison.rows.map((row) => (
            <details key={row.assignment.row} className="border rounded p-2 my-2">
              <summary>
                查询样本 {row.assignment.row} → 分群 {row.assignment.cluster}
              </summary>
              {row.neighbors.map((neighbor) => (
                <div key={neighbor.row} className="py-2 overflow-auto">
                  <h4>
                    参考样本行 {neighbor.row} · 分群 {neighbor.cluster} · 距离平方{' '}
                    {number(neighbor.distance_squared)}
                  </h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th>特征</th>
                        <th>查询值</th>
                        <th>参考值</th>
                        <th>标准化差</th>
                        <th>平方贡献</th>
                      </tr>
                    </thead>
                    <tbody>
                      {neighbor.terms.map((term) => (
                        <tr key={term.feature}>
                          <td>{term.feature}</td>
                          <td>{number(term.value)}</td>
                          <td>{number(term.reference_value)}</td>
                          <td>{number(term.standardized_difference)}</td>
                          <td>{number(term.squared_distance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => explain(row.assignment.row)}
                className="border rounded px-3 py-1"
              >
                保存样本证据链
              </button>
            </details>
          ))}
        </section>
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
      {!!study.sample_evidence && (
        <details>
          <summary>FoKn 样本事实与推导</summary>
          <pre className="text-xs overflow-auto max-h-64">
            {JSON.stringify(study.sample_evidence, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
