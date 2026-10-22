import { useRef, useState } from 'react';
import { ImportedModelClient } from '@Services/native-study/ImportedModelClient';
import { parseStudyModel } from '@Services/native-study/studyModel';
import { useScopedNativeRead } from './useScopedNativeRead';

export function ImportedModel({
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
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [csv, setCsv] = useState('');
  const [error, setError] = useState('');
  const selection = useRef(0);
  const scope = JSON.stringify([notebookId, workspace, revision, model, csv]);
  const { state, read } = useScopedNativeRead(scope, busy, (signal) =>
    new ImportedModelClient(notebookId).assign(workspace, revision, model, csv, signal)
  );
  const load = async (file?: File) => {
    const attempt = ++selection.current;
    setModel('');
    setName('');
    setError('');
    if (!file) return;
    try {
      if (file.size > 128 * 1024) throw new Error('模型文件不能超过 128 KiB。');
      const text = await file.text();
      parseStudyModel(text);
      if (selection.current === attempt) {
        setModel(text);
        setName(file.name);
      }
    } catch (reason) {
      if (selection.current === attempt) setError(String(reason));
    }
  };
  return (
    <section aria-label="导入房屋分群模型" className="space-y-3 border rounded p-3">
      <h3 className="font-semibold">使用已有分群模型</h3>
      <p className="text-sm text-muted-foreground">
        上传已导出的分群模型，对新样本进行分群。由本机 Rust 服务计算，无需
        LLM；不会替换当前研究或恢复原始邻居证据。
      </p>
      <label className="block">
        冻结分群模型文件
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => void load(event.target.files?.[0])}
        />
      </label>
      {name && <p>已加载：{name}</p>}
      <label className="block">
        导入模型的新样本 CSV
        <textarea
          value={csv}
          disabled={busy}
          className="block w-full border rounded p-2"
          onChange={(event) => setCsv(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="border rounded px-3 py-2 disabled:opacity-50"
        disabled={busy || !model || !csv.trim() || state.status === 'loading'}
        onClick={() => void read()}
      >
        使用导入模型分群
      </button>
      {error && <p role="alert">{error}</p>}
      {state.status === 'loading' && <p role="status">正在计算分群…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <div aria-label="导入模型分群结果">
          {state.value.map((row) => (
            <details key={row.row}>
              <summary>
                样本 {row.row} → 分群 {row.cluster} · 距离平方 {row.distance_squared.toPrecision(6)}
              </summary>
              <ul>
                {row.terms.map((term) => (
                  <li key={term.feature}>
                    {term.feature}：原值 {term.value}，中心 {term.center}，距离贡献{' '}
                    {term.squared_distance.toPrecision(6)}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
