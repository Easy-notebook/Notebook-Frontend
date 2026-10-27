import { useState } from 'react';
import { SkillArchiveClient } from '@Services/native-study/SkillArchiveClient';
import { SkillModelClient, type SkillModel } from '@Services/native-study/SkillModelClient';
import { downloadBlob } from '@Services/notebook/BrowserDownload';
import { useScopedNativeRead } from './useScopedNativeRead';
export function SkillArchiveImport(props: {
  notebookId: string;
  workspace: string;
  revision: number;
  busy: boolean;
  onImported: (lock: unknown, models: SkillModel[], name: string) => void;
}) {
  const [file, setFile] = useState<File>();
  const [name, setName] = useState('house-feature-review');
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [version, setVersion] = useState(0);
  const scope = JSON.stringify([props.notebookId, props.workspace, props.revision, name, version]);
  const inspected = useScopedNativeRead(scope, props.busy, async (signal) => {
    if (!file || file.size > 2 * 1024 * 1024)
      throw new Error('请选择不超过 2 MiB 的技能 ZIP 或 tar.gz。');
    const input = {
      workspace: props.workspace,
      expected_revision: props.revision,
      name,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    };
    if (signal.aborted) throw new Error('已取消档案读取。');
    const response = await new SkillArchiveClient(props.notebookId).inspect(input, signal);
    return { input, response };
  });
  const ready = inspected.state.status === 'ready' ? inspected.state.value : null;
  const accepted = useScopedNativeRead(
    JSON.stringify([scope, ready?.response.content_hash, reviewer, note, confirmed]),
    props.busy,
    async (signal) => {
      if (
        !ready ||
        !confirmed ||
        !reviewer.trim() ||
        !note.trim() ||
        ready.response.scan.verdict === 'dangerous'
      )
        throw new Error('请先检查内容并填写审核记录。');
      const response = await new SkillArchiveClient(props.notebookId).accept(
        ready.input,
        ready.response.content_hash,
        reviewer,
        note,
        signal
      );
      if (!('lock' in response)) throw new Error('服务未返回已审核锁文件。');
      return {
        lock: response.lock,
        models: await new SkillModelClient(props.notebookId).inspect(response.lock, signal),
      };
    }
  );
  return (
    <section aria-label="导入技能档案" className="space-y-3 rounded border p-3">
      <h4 className="font-semibold">从技能档案导入房屋模型</h4>
      <p>读取 ZIP / tar.gz 中的冻结模型。检查和接受内容不会授权执行包内指令。</p>
      <label className="block">
        技能档案文件
        <input
          type="file"
          accept=".zip,.tar.gz,.tgz"
          disabled={props.busy}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setVersion((v) => v + 1);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="block">
        技能名称
        <input
          value={name}
          disabled={props.busy}
          onChange={(e) => {
            setName(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <button
        type="button"
        disabled={props.busy || !file || !name.trim() || inspected.state.status === 'loading'}
        onClick={() => {
          setConfirmed(false);
          void inspected.read();
        }}
      >
        检查技能档案
      </button>
      {inspected.state.status === 'loading' && <p role="status">正在检查档案…</p>}
      {inspected.state.status === 'error' && <p role="alert">{inspected.state.message}</p>}
      {ready && (
        <div>
          <p>
            扫描结果：
            {
              { clear: '未发现已知风险', caution: '需要注意', dangerous: '禁止接受' }[
                ready.response.scan.verdict
              ]
            }
          </p>
          <p className="break-all">内容标识：{ready.response.content_hash}</p>
          <details>
            <summary>查看完整候选包与扫描结果</summary>
            <pre className="max-h-80 overflow-auto text-xs">
              {JSON.stringify(ready.response, null, 2)}
            </pre>
          </details>
          <label className="block">
            审核人
            <input
              value={reviewer}
              maxLength={256}
              disabled={props.busy}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <label className="block">
            审核说明
            <textarea
              value={note}
              maxLength={4096}
              disabled={props.busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={props.busy || ready.response.scan.verdict === 'dangerous'}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已核对本次档案内容
          </label>
          <button
            type="button"
            disabled={
              props.busy ||
              !confirmed ||
              !reviewer.trim() ||
              !note.trim() ||
              ready.response.scan.verdict === 'dangerous' ||
              accepted.state.status === 'loading'
            }
            onClick={() => void accepted.read()}
          >
            接受档案内容
          </button>
        </div>
      )}
      {accepted.state.status === 'loading' && <p role="status">正在核对接受记录…</p>}
      {accepted.state.status === 'error' && <p role="alert">{accepted.state.message}</p>}
      {accepted.state.status === 'ready' && (
        <div>
          <p>内容已接受，尚未授权技能执行。</p>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => {
              if (accepted.state.status === 'ready')
                props.onImported(
                  accepted.state.value.lock,
                  accepted.state.value.models,
                  file?.name ?? name
                );
            }}
          >
            使用档案中的房屋模型
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => {
              if (accepted.state.status === 'ready')
                downloadBlob(
                  new Blob([JSON.stringify(accepted.state.value.lock, null, 2)], {
                    type: 'application/json',
                  }),
                  `${name}.lock.json`
                );
            }}
          >
            下载已审核锁文件
          </button>
        </div>
      )}
    </section>
  );
}
