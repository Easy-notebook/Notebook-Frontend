import type { CommandProgress } from '@Services/native-study/NativeOperationObserver';

export function StudyProgress({ progress }: { progress: CommandProgress | null }) {
  if (!progress || progress.status === 'waiting') return null;
  if (progress.status !== 'observed')
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {progress.status === 'unknown'
          ? '当前服务没有这次操作的进度记录。'
          : '暂时无法读取执行进度。'}
        这不代表操作未执行；恢复时请使用原请求重试。
      </p>
    );
  const value = progress.observation;
  const active = value.active;
  const state =
    value.phase === 'running'
      ? active.model
        ? '正在等待模型回答'
        : active.skill
          ? '正在执行数据技能'
          : 'Rust 正在执行'
      : {
          succeeded: '最近一次调用已返回成功，研究结果仍需读取确认',
          failed: '最近一次调用已返回错误',
          interrupted: '最近一次执行观察已中断',
        }[value.phase];
  return (
    <p role="status" aria-label="原生执行进度" className="text-sm text-muted-foreground">
      {state} · 已返回成功的调用 {value.completed_calls}
      {value.failed_calls > 0 ? ` · 返回错误的调用 ${value.failed_calls}` : ''}
    </p>
  );
}
