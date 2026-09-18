import { useEffect, useId, useRef, useState } from 'react';
import { observePreview } from './utils/previewVisibility';
let renderer: Promise<(typeof import('mermaid'))['default']> | undefined;
function loadRenderer() {
  renderer ??= import('mermaid')
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
      });
      return mermaid;
    })
    .catch((error) => {
      renderer = undefined;
      throw error;
    });
  return renderer;
}

/** Reusable, derived preview; the caller retains the original source text. */
export function MermaidPreview({ source }: { source: string }) {
  const id = useId().replace(/:/g, '');
  const renderSequence = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const completedSource = useRef<string>();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (container.current) return observePreview(container.current, setVisible);
  }, []);

  useEffect(() => {
    let current = true;
    if (!visible || completedSource.current === source) return;
    if (!source.trim()) {
      completedSource.current = undefined;
      setSvg('');
      setError('Enter Mermaid source to preview the diagram.');
      return () => {
        current = false;
      };
    }
    const renderId = `notebook-mermaid-${id}-${++renderSequence.current}`;
    const timer = window.setTimeout(() => {
      loadRenderer()
        .then((mermaid) => (current ? mermaid.render(renderId, source) : undefined))
        .then((result) => {
          if (!current || !result) return;
          setSvg(result.svg);
          setError('');
          completedSource.current = source;
        })
        .catch((reason: unknown) => {
          if (!current) return;
          completedSource.current = undefined;
          setSvg('');
          setError(reason instanceof Error ? reason.message : 'Diagram could not be rendered.');
        });
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [id, source, visible]);

  if (error)
    return (
      <div ref={container} className="notebook-mermaid-error" role="status">
        {error}
      </div>
    );
  if (!svg)
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
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
