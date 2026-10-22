import type { NativeView } from '@Services/native-study/contracts';
const number = (value: number) => value.toPrecision(6);
export function ComparisonEvidence({
  comparison,
  busy = false,
  explain,
}: {
  comparison: NonNullable<NativeView['study']['comparison']>;
  busy?: boolean;
  explain?: (row: number) => void;
}) {
  return (
    <section aria-label="相似样本解释">
      <h3 className="font-semibold">相似样本与逐特征距离</h3>
      {comparison.rows.map((row) => (
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
          {explain && (
            <button
              type="button"
              disabled={busy}
              onClick={() => explain(row.assignment.row)}
              className="border rounded px-3 py-1"
            >
              保存样本证据链
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
