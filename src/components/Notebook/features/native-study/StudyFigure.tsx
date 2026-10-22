import { studyFigureSource, type NativeClusterFigure } from '@Services/native-study/studyFigure';
import { useState } from 'react';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { useScopedNativeRead } from './useScopedNativeRead';
export function StudyFigure({
  notebookId,
  workspace,
  revision,
  reference,
  features,
  savedFigure,
  busy,
}: {
  notebookId: string;
  workspace: string;
  revision: number;
  reference: string;
  features: string[];
  savedFigure?: NativeClusterFigure | null;
  busy: boolean;
}) {
  const saved =
    savedFigure?.reference_id === reference &&
    features.includes(savedFigure.x_feature) &&
    features.includes(savedFigure.y_feature)
      ? savedFigure
      : null;
  const [x, setX] = useState(saved?.x_feature ?? features[0] ?? '');
  const [y, setY] = useState(saved?.y_feature ?? features[1] ?? '');
  const xFeature = features.includes(x) ? x : (features[0] ?? '');
  const yFeature = features.includes(y) ? y : (features[1] ?? '');
  const blocked = busy || !xFeature || !yFeature || xFeature === yFeature;
  const scope = JSON.stringify([notebookId, workspace, revision, reference, xFeature, yFeature]);
  const { state, read } = useScopedNativeRead(scope, blocked, (signal) =>
    new NativeStudyClient(notebookId).figure(
      {
        workspace,
        expected_revision: revision,
        expected_reference_id: reference,
        x_feature: xFeature,
        y_feature: yFeature,
      },
      signal
    )
  );
  const figure =
    state.status === 'ready'
      ? state.value.figure
      : state.status === 'idle' &&
          !blocked &&
          saved?.x_feature === xFeature &&
          saved?.y_feature === yFeature
        ? saved
        : null;
  const source = figure ? studyFigureSource(figure) : undefined;
  return (
    <section aria-label="房屋分群图" className="space-y-3">
      <h3 className="font-semibold">房屋分群图</h3>
      <p className="text-sm text-muted-foreground">
        使用保存的参考数据，按两个原始特征绘图。颜色来自完整特征空间的分群；二维重叠不代表同群，距离不说明价格或因果。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label>
          横轴
          <select
            aria-label="分群图横轴"
            className="ml-2 rounded border p-2"
            value={xFeature}
            disabled={busy}
            onChange={(e) => setX(e.target.value)}
          >
            {features.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          纵轴
          <select
            aria-label="分群图纵轴"
            className="ml-2 rounded border p-2"
            value={yFeature}
            disabled={busy}
            onChange={(e) => setY(e.target.value)}
          >
            {features.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded border px-3 py-2 disabled:opacity-50"
          disabled={blocked || state.status === 'loading'}
          onClick={() => void read()}
        >
          {state.status === 'loading' ? '正在绘图' : '生成分群图'}
        </button>
      </div>
      {features.length < 2 && <p className="text-sm">二维图需要至少两个拟合特征。</p>}
      {xFeature === yFeature && features.length >= 2 && (
        <p className="text-sm">请选择两个不同特征。</p>
      )}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {figure && (
        <figure className="space-y-2">
          <img
            src={source}
            alt={`房屋分群：${figure.x_feature} 与 ${figure.y_feature}`}
            className="w-full rounded border bg-white"
          />
          <figcaption className="text-sm">
            显示 {figure.points.length}/{figure.reference_rows} 个原始样本，按行序确定性抽样。
          </figcaption>
          <a className="text-sm underline" href={source} download={figure.name}>
            下载分群 SVG
          </a>
          <details className="text-sm">
            <summary>图表来源与限制</summary>
            <p className="break-all">参考：{figure.reference_id}</p>
            <p className="break-all">输入 SHA-256：{figure.input_csv_sha256}</p>
            <p>{figure.caption}</p>
          </details>
        </figure>
      )}
    </section>
  );
}
