import { useEffect, useState } from 'react';
import { mathRenderService } from './MathRenderService';
import { PreviewEngineLoadError } from './PreviewEngineLoadError';

type Result = { source: string; displayMode: boolean; attempt: number } & (
  | { html: string; error?: never }
  | { error: string; reloadRequired: boolean; html?: never }
);

export function useMathPreview(source: string, displayMode: boolean, defer = false, active = true) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const current =
    result?.source === source && result.displayMode === displayMode && result.attempt === attempt
      ? result
      : null;
  useEffect(() => {
    const controller = new AbortController();
    if (!source) {
      setResult(null);
      return;
    }
    if (!active) return;
    if (current) return;
    const render = () =>
      mathRenderService.render(source, displayMode, controller.signal).then(
        (html) => {
          if (!controller.signal.aborted && html !== undefined)
            setResult({ source, displayMode, attempt, html });
        },
        (reason) => {
          if (!controller.signal.aborted)
            setResult({
              source,
              displayMode,
              attempt,
              error: reason instanceof Error ? reason.message : 'Formula could not be rendered.',
              reloadRequired: reason instanceof PreviewEngineLoadError,
            });
        }
      );
    const timer = defer ? window.setTimeout(render, 180) : undefined;
    if (!defer) void render();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [source, displayMode, attempt, defer, current, active]);
  return {
    html: current?.html ?? '',
    error: current?.error ?? '',
    reloadRequired: !!current && 'reloadRequired' in current && current.reloadRequired,
    pending: active && !!source && !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
