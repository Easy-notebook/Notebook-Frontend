import { useEffect, useId, useRef, useState } from 'react';
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
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    if (!source.trim()) {
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
        })
        .catch((reason: unknown) => {
          if (!current) return;
          setSvg('');
          setError(reason instanceof Error ? reason.message : 'Diagram could not be rendered.');
        });
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [id, source]);

  if (error)
    return (
      <div className="notebook-mermaid-error" role="status">
        {error}
      </div>
    );
  if (!svg)
    return (
      <div className="notebook-mermaid-loading" role="status">
        Rendering diagram…
      </div>
    );
  return (
    <div
      className="notebook-mermaid-preview"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
