import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as HTMLDivElement).innerHTML = chart;
      mermaid.initialize({ startOnLoad: true });
      mermaid.init(undefined, containerRef.current);
    }
  }, [chart]);
  return <div ref={containerRef} className="mermaid" />;
};
