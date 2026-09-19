import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  const placeholderHeight = useRef(80);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<RenderResult | null>(null);
  const currentResult = result?.source === source && result.theme === resolvedTheme ? result : null;

  useEffect(() => {
    if (container.current) return observePreview(container.current, setVisible);
  }, []);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element || currentResult?.status !== 'ready') return;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) placeholderHeight.current = height;
    };
    // Capture ready geometry before a source/theme update replaces the SVG with
    // a loading placeholder. Resizes can change wrapping after the initial paint.
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [currentResult]);

  useEffect(() => {
    if (visible || result?.status !== 'ready') return;
    // Keep short scroll reversals cheap; long-offscreen diagrams release both
    // their SVG DOM and derived string. Original source remains caller-owned.
    const element = container.current;
    if (!element) return;
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reclaim, 500);
    };
    const reclaim = () => {
      const selection = document.getSelection();
      if (
        element.contains(document.activeElement) ||
        (selection && !selection.isCollapsed && selection.containsNode(element, true))
      ) {
        // Subscribe only while interaction pins an offscreen diagram. A range
        // may span the whole diagram with both endpoints outside its subtree.
        element.addEventListener('focusout', schedule);
        document.addEventListener('selectionchange', schedule);
        return;
      }
      const height = element.getBoundingClientRect().height;
      if (height > 0) placeholderHeight.current = height;
      setResult(null);
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      element.removeEventListener('focusout', schedule);
      document.removeEventListener('selectionchange', schedule);
    };
  }, [visible, result]);

  useEffect(() => {
    if (!source.trim()) {
      // Clearing source ends ownership of any derived SVG/error, even while visible.
      setResult(null);
      return;
    }
    if (!visible || currentResult) return;
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
        style={{ height: placeholderHeight.current, overflow: 'hidden' }}
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
