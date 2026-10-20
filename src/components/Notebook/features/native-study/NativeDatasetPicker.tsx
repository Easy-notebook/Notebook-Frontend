import { useEffect, useRef, useState } from 'react';
import { NativeDatasetClient } from '@Services/native-study/NativeDatasetClient';
import {
  NativeDatasetSession,
  type DatasetSnapshot,
} from '@Services/native-study/NativeDatasetSession';
import { publishDatasetCell } from '@Services/native-study/publishDatasetCell';

/** CSV archive owned by the native study, separate from Python's file workspace. */
export function NativeDatasetPicker({
  notebookId,
  disabled,
  onSelect,
  onBusyChange,
  columns,
  clusters,
}: {
  notebookId: string;
  disabled: boolean;
  onSelect: (csv: string) => void;
  onBusyChange: (busy: boolean) => void;
  columns: readonly string[];
  clusters: number;
}) {
  const session = useRef<NativeDatasetSession | null>(null);
  const owner = useRef(notebookId);
  owner.current = notebookId;
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const busyChange = useRef(onBusyChange);
  busyChange.current = onBusyChange;
  const insertion = useRef<AbortController | null>(null);
  const [inserting, setInserting] = useState(false);
  const [insertionNotice, setInsertionNotice] = useState('');
  const [state, setState] = useState<DatasetSnapshot>({
    phase: 'idle',
    datasets: [],
    selected: null,
    error: null,
  });
  useEffect(() => {
    setInserting(false);
    setInsertionNotice('');
    setState({ phase: 'idle', datasets: [], selected: null, error: null });
    const owned = new NativeDatasetSession(
      new NativeDatasetClient(notebookId),
      (next) => {
        if (owner.current !== notebookId) return;
        setState(next);
        busyChange.current(next.phase === 'loading' || next.phase === 'uploading');
      },
      (value) => {
        if (owner.current === notebookId) selection.current(value.csv);
      }
    );
    session.current = owned;
    return () => {
      owned.dispose();
      insertion.current?.abort();
      insertion.current = null;
      busyChange.current(false);
      if (session.current === owned) session.current = null;
    };
  }, [notebookId]);
  const busy = inserting || state.phase === 'loading' || state.phase === 'uploading';
  const insert = async () => {
    if (!state.selected || disabled || busy || insertion.current) return;
    const attempt = new AbortController();
    insertion.current = attempt;
    setInserting(true);
    setInsertionNotice('');
    busyChange.current(true);
    try {
      await publishDatasetCell(notebookId, state.selected, columns, clusters, attempt.signal);
      if (insertion.current === attempt && owner.current === notebookId && !attempt.signal.aborted)
        setInsertionNotice(
          '已保存 AAL 分群单元格。关闭研究面板后可运行，重复插入不会新增同一配置。'
        );
    } catch (error) {
      if (insertion.current === attempt && owner.current === notebookId && !attempt.signal.aborted)
        setInsertionNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (insertion.current === attempt) {
        insertion.current = null;
        setInserting(false);
        busyChange.current(false);
      }
    }
  };
  return (
    <fieldset disabled={disabled || busy} className="space-y-2 rounded border p-3">
      <legend className="text-sm font-medium">当前笔记的 CSV 文件</legend>
      <p className="text-sm text-muted-foreground">
        文件由 Rust 保存。同名文件修改后保留历史版本；研究保存读入时的完整内容。
      </p>
      <label className="block text-sm">
        上传并读入 CSV
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="参考数据 CSV 文件"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void session.current?.upload(file);
          }}
        />
      </label>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        onClick={() => void session.current?.refresh()}
      >
        读取已保存 CSV
      </button>
      {state.datasets.length > 0 && (
        <label className="block text-sm">
          选择文件版本
          <select
            aria-label="选择 CSV 文件版本"
            className="block w-full rounded border bg-background p-2"
            value={state.selected?.version ?? ''}
            onChange={(event) => {
              if (event.target.value) void session.current?.read(event.target.value);
            }}
          >
            <option value="">选择后读入研究输入</option>
            {state.datasets.map((item) => (
              <option key={item.version} value={item.version}>
                {item.name} · {item.version.slice(0, 12)} · {item.size} 字节
              </option>
            ))}
          </select>
        </label>
      )}
      {(state.phase === 'loading' || state.phase === 'uploading') && (
        <p role="status">
          {state.phase === 'uploading' ? '正在保存 CSV 文件…' : '正在读取 CSV 文件…'}
        </p>
      )}
      {state.phase === 'ready' && state.datasets.length === 0 && (
        <p role="status" className="text-sm">
          当前笔记尚未保存 CSV 文件。
        </p>
      )}
      {state.selected && (
        <>
          <p className="break-all text-xs">
            最近读入：{state.selected.name} · SHA-256 {state.selected.sha256}
          </p>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => void insert()}
          >
            插入 AAL 分群单元格
          </button>
          <p className="text-xs text-muted-foreground">
            使用所选文件版本、下方数值特征和分群数量。
          </p>
        </>
      )}
      {inserting && <p role="status">正在保存 AAL 单元格…</p>}
      {insertionNotice && (
        <p role="status" className="text-sm">
          {insertionNotice}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}。可重试读取或重新上传同一文件；离开页面不会撤销已保存的上传。
        </p>
      )}
    </fieldset>
  );
}
