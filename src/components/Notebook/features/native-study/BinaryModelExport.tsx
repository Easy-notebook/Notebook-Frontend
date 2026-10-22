import { ModelFileClient } from '@Services/native-study/ModelFileClient';
import { studyModelExport } from '@Services/native-study/studyModel';
import { downloadBlob } from '@Services/notebook/BrowserDownload';
import type { NativeView } from '@Services/native-study/contracts';
import { useScopedNativeRead } from './useScopedNativeRead';

export function BinaryModelExport({
  notebookId,
  view,
  disabled,
}: {
  notebookId: string;
  view: NativeView;
  disabled: boolean;
}) {
  const scope = JSON.stringify([notebookId, view.document.id, view.document.revision]);
  const { state, read } = useScopedNativeRead(scope, disabled, (signal) =>
    new ModelFileClient(notebookId).encode(studyModelExport(view), signal)
  );
  return (
    <span className="inline-flex flex-wrap gap-2 items-center">
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        disabled={disabled || state.status === 'loading'}
        onClick={() => void read()}
      >
        {state.status === 'loading' ? '正在生成二进制模型…' : '导出二进制模型'}
      </button>
      {state.status === 'ready' && (
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={() =>
            downloadBlob(
              new Blob([state.value], { type: 'application/octet-stream' }),
              'mining-model.aalkm'
            )
          }
        >
          保存 .aalkm 文件
        </button>
      )}
      {state.status === 'error' && <span role="alert">{state.message}</span>}
    </span>
  );
}
