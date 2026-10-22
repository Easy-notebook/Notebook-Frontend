import { SkillModelClient, type SkillModel } from '@Services/native-study/SkillModelClient';
import { ModelFileClient } from '@Services/native-study/ModelFileClient';
import { ImportedReferenceComparison } from './ImportedReferenceComparison';
import { useEffect, useRef, useState } from 'react';
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
  const [resources, setResources] = useState<SkillModel[]>([]);
  const [resourceIndex, setResourceIndex] = useState('');
  const selection = useRef(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      selection.current += 1;
      pending.current?.abort();
    },
    [notebookId, workspace]
  );
  const scope = JSON.stringify([notebookId, workspace, revision, model, csv]);
  const { state, read } = useScopedNativeRead(scope, busy, (signal) =>
    new ImportedModelClient(notebookId).assign(workspace, revision, model, csv, signal)
  );
  const load = async (file?: File) => {
    const attempt = ++selection.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setModel('');
    setName('');
    setError('');
    setResources([]);
    setResourceIndex('');
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('技能资源锁文件不能超过 5 MiB。');
      const text = file.name.toLowerCase().endsWith('.aalkm')
        ? await new ModelFileClient(notebookId).decode(
            new Uint8Array(await file.arrayBuffer()),
            controller.signal
          )
        : await file.text();
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'skills' in parsed) {
        const entries = await new SkillModelClient(notebookId).inspect(parsed, controller.signal);
        if (selection.current === attempt) {
          setResources(entries);
          setName(file.name);
        }
        return;
      }
      if (file.size > 128 * 1024) throw new Error('模型文件不能超过 128 KiB。');
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
        LLM；不会替换当前研究或迁移原工作区的 FoKn 声明。
      </p>
      <label className="block">
        冻结分群模型文件
        <input
          type="file"
          accept=".json,.aalkm,application/json,application/octet-stream"
          disabled={busy}
          onChange={(event) => void load(event.target.files?.[0])}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        也可上传技能资源锁 JSON（最多 5 MiB），从冻结包中选择房屋模型；不会执行包内指令。
      </p>
      {name && <p>已加载：{name}</p>}
      {resources.length > 0 && (
        <label className="block">
          技能包中的房屋模型
          <select
            value={resourceIndex}
            disabled={busy}
            onChange={(event) => {
              const index = event.target.value;
              setResourceIndex(index);
              setModel(index === '' ? '' : JSON.stringify(resources[Number(index)].model));
            }}
          >
            <option value="">请选择模型</option>
            {resources.map((entry, index) => (
              <option key={index} value={String(index)}>
                {entry.skill} · {entry.path} · {entry.location}
              </option>
            ))}
          </select>
          {resourceIndex !== '' && (
            <p className="text-xs break-all">
              来源校验值：{resources[Number(resourceIndex)].content_hash}
            </p>
          )}
        </label>
      )}
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
      <ImportedReferenceComparison
        notebookId={notebookId}
        workspace={workspace}
        revision={revision}
        model={model}
        csv={csv}
        busy={busy || state.status === 'loading'}
      />
    </section>
  );
}
