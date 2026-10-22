import { useEffect, useRef, useState } from 'react';
import {
  NativeDatasetClient,
  type DatasetMetadata,
} from '@Services/native-study/NativeDatasetClient';
import { downloadBlob } from '@Services/notebook/BrowserDownload';

/** One immutable version, with cancellation owned by the visible notebook picker. */
export function DatasetDownload({
  notebookId,
  dataset,
  disabled,
  onBusyChange,
}: {
  notebookId: string;
  dataset: DatasetMetadata;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const attempt = useRef<AbortController | null>(null);
  const identity = `${notebookId}\0${dataset.version}`;
  const owner = useRef(identity);
  owner.current = identity;
  const changed = useRef(onBusyChange);
  changed.current = onBusyChange;
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'released' | 'error'>('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    setPhase('idle');
    setError('');
    return () => {
      attempt.current?.abort();
      attempt.current = null;
      changed.current(false);
    };
  }, [identity]);
  const download = async () => {
    if (disabled || attempt.current) return;
    const request = new AbortController();
    attempt.current = request;
    setPhase('downloading');
    setError('');
    changed.current(true);
    try {
      const blob = await new NativeDatasetClient(notebookId).download(dataset, request.signal);
      if (attempt.current !== request || owner.current !== identity || request.signal.aborted)
        return;
      downloadBlob(blob, dataset.name);
      setPhase('released');
    } catch (reason) {
      if (attempt.current === request && owner.current === identity && !request.signal.aborted) {
        setError(reason instanceof Error ? reason.message : String(reason));
        setPhase('error');
      }
    } finally {
      if (attempt.current === request) {
        attempt.current = null;
        changed.current(false);
      }
    }
  };
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled || phase === 'downloading'}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        onClick={() => void download()}
      >
        下载所选 CSV 原文件
      </button>
      {phase === 'downloading' && (
        <p role="status" className="text-sm">
          正在读取并校验原文件…
        </p>
      )}
      {phase === 'released' && (
        <p role="status" className="text-sm">
          原文件已交给浏览器下载。
        </p>
      )}
      {phase === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {error}。可重试下载此版本。
        </p>
      )}
    </div>
  );
}
