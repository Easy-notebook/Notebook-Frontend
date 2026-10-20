import { useEffect, useRef, useState } from 'react';
import { NativeDatasetClient } from '@Services/native-study/NativeDatasetClient';
import {
  NativeDatasetSession,
  type DatasetSnapshot,
} from '@Services/native-study/NativeDatasetSession';

/** CSV archive owned by the native study, separate from Python's file workspace. */
export function NativeDatasetPicker({
  notebookId,
  disabled,
  onSelect,
  onBusyChange,
}: {
  notebookId: string;
  disabled: boolean;
  onSelect: (csv: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const session = useRef<NativeDatasetSession | null>(null);
  const owner = useRef(notebookId);
  owner.current = notebookId;
  const selection = useRef(onSelect);
  selection.current = onSelect;
  const busyChange = useRef(onBusyChange);
  busyChange.current = onBusyChange;
  const [state, setState] = useState<DatasetSnapshot>({
    phase: 'idle',
    datasets: [],
    selected: null,
    error: null,
  });
  useEffect(() => {
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
      busyChange.current(false);
      if (session.current === owned) session.current = null;
    };
  }, [notebookId]);
  const busy = state.phase === 'loading' || state.phase === 'uploading';
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
      {busy && (
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
        <p className="break-all text-xs">
          最近读入：{state.selected.name} · SHA-256 {state.selected.sha256}
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
