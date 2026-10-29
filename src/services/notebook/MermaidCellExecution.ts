import type { ExecutionResult } from '@Services/types';
import { mermaidRenderService } from '../rendering/MermaidRenderService';

/** A local execution produces the same persisted image output as a remote kernel. */
export class MermaidCellExecution {
  async execute(source: string, signal: AbortSignal): Promise<ExecutionResult> {
    signal.throwIfAborted();
    const rendered = await mermaidRenderService.render({
      id: `mermaid-cell-${crypto.randomUUID()}`,
      source,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      signal,
    });
    signal.throwIfAborted();
    if (!rendered) throw new Error('Mermaid rendering was cancelled');
    // SVG image outputs need intrinsic dimensions; Mermaid's width="100%"
    // otherwise collapses inside the shared shrink-to-fit image container.
    const svgDocument = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml');
    const svg = svgDocument.documentElement;
    const bounds = svg
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (bounds?.length === 4 && bounds[2] > 0 && bounds[3] > 0) {
      svg.setAttribute('width', String(bounds[2]));
      svg.setAttribute('height', String(bounds[3]));
    }
    const image = new XMLSerializer().serializeToString(svg);
    return {
      status: 'ok',
      outputs: [
        {
          type: 'image',
          content: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`,
        },
      ],
    };
  }
}
