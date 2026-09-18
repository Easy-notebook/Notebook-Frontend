import { useEffect, useId, useRef, useState } from 'react';
import { observePreview } from './utils/previewVisibility';
import { useTheme } from '@/contexts/ThemeContext';
import { mermaidRenderService } from './model/MermaidRenderService';

type RenderResult = { source: string; theme: string } & (
  | { status: 'ready'; svg: string }
  | { status: 'failed'; message: string }
);

/** Reusable, derived preview; the caller retains the original source text. */
export function MermaidPreview({ source }: { source: string }) {
  const id = useId().replace(/:/g, '');
  const { resolvedTheme } = useTheme();
  const renderSequence = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<RenderResult | null>(null);
  const currentResult = result?.source === source && result.theme === resolvedTheme ? result : null;

  useEffect(() => {
    if (container.current) return observePreview(container.current, setVisible);
  }, []);

  useEffect(() => {
    if (!visible || currentResult || !source.trim()) return;
    const controller = new AbortController();
    const renderId = `notebook-mermaid-${id}-${++renderSequence.current}`;
    const timer = window.setTimeout(() => {
      mermaidRenderService
        .render({ id: renderId, source, theme: resolvedTheme, signal: controller.signal })
        .then((rendered) => {
          if (controller.signal.aborted || !rendered) return;
          setResult({ source, theme: resolvedTheme, status: 'ready', svg: rendered.svg });
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setResult({
            source,
            theme: resolvedTheme,
            status: 'failed',
            message: reason instanceof Error ? reason.message : 'Diagram could not be rendered.',
          });
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, source, resolvedTheme, visible, currentResult]);

  if (!source.trim() || currentResult?.status === 'failed')
    return (
      <div ref={container} className="notebook-mermaid-error" role="status">
        {currentResult?.status === 'failed'
          ? currentResult.message
          : 'Enter Mermaid source to preview the diagram.'}
        {currentResult?.status === 'failed' && (
          <button type="button" onClick={() => setResult(null)}>
            Retry diagram
          </button>
        )}
      </div>
    );
  if (currentResult?.status !== 'ready')
    return (
      <div
        ref={container}
        className="notebook-mermaid-loading"
        role="status"
        style={{ minHeight: 80 }}
      >
        {visible ? 'Rendering diagram…' : 'Diagram preview loads when visible.'}
      </div>
    );
  return (
    <div
      ref={container}
      className="notebook-mermaid-preview"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: currentResult.svg }}
    />
  );
}
