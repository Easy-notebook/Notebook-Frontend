import { useState } from 'react';
import { ImportedModelClient } from '@Services/native-study/ImportedModelClient';
import { ComparisonEvidence } from './ComparisonEvidence';
import { useScopedNativeRead } from './useScopedNativeRead';
export function ImportedReferenceComparison({
  notebookId,
  workspace,
  revision,
  model,
  csv,
  busy,
}: {
  notebookId: string;
  workspace: string;
  revision: number;
  model: string;
  csv: string;
  busy: boolean;
}) {
  const [reference, setReference] = useState('');
  const [identity, setIdentity] = useState('');
  const [neighbors, setNeighbors] = useState(3);
  const scope = JSON.stringify([
    notebookId,
    workspace,
    revision,
    model,
    csv,
    reference,
    identity,
    neighbors,
  ]);
  const { state, read } = useScopedNativeRead(scope, busy, (signal) =>
    new ImportedModelClient(notebookId).compare(
      workspace,
      revision,
      model,
      csv,
      reference,
      identity,
      neighbors,
      signal
    )
  );
  return (
    <details className="border rounded p-3" aria-label="导入参考相似比较">
      <summary>使用原始参考样本解释相似性</summary>
      <p className="text-sm">
        需要原模型对应的参考 CSV 和原报告 reference_id。仅计算数值证据，不迁移原工作区的 FoKn 声明。
      </p>
      <label className="block">
        导入参考 CSV
        <textarea
          className="block w-full border rounded p-2"
          disabled={busy}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <label className="block">
        原报告参考身份
        <input
          className="block w-full border rounded p-2"
          disabled={busy}
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
        />
      </label>
      <label className="block">
        导入比较邻居数
        <input
          type="number"
          min={1}
          max={8}
          disabled={busy}
          value={neighbors}
          onChange={(e) => setNeighbors(Number(e.target.value))}
        />
      </label>
      <button
        type="button"
        className="border rounded px-3 py-2 disabled:opacity-50"
        disabled={
          busy ||
          !model ||
          !csv.trim() ||
          !reference.trim() ||
          !identity.trim() ||
          !Number.isInteger(neighbors) ||
          neighbors < 1 ||
          neighbors > 8 ||
          state.status === 'loading'
        }
        onClick={() => void read()}
      >
        比较导入参考样本
      </button>
      {state.status === 'loading' && <p role="status">正在校验参考并计算邻居…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <div aria-label="导入参考比较结果">
          <p>已核对参考：{state.value.reference_id}</p>
          <ComparisonEvidence comparison={state.value} />
        </div>
      )}
    </details>
  );
}
