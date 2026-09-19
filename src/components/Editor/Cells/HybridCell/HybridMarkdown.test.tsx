import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const lifecycle = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock('../../MermaidPreview', () => ({
  MermaidPreview: ({ source }: { source: string }) => {
    useEffect(() => {
      lifecycle.mount();
      return () => lifecycle.unmount();
    }, []);
    return <div aria-label="Diagram source">{source}</div>;
  },
}));
import { HybridMarkdown } from './HybridMarkdown';
it('renders inline and display math while preserving literal code', () => {
  const view = render(<HybridMarkdown source={'Inline $x^2$\n\n$$\ny = x + 1\n$$\n\n`$literal$`\n\n```python\nprint("$value$")\n```'} />);
  expect(view.container.querySelectorAll('.katex')).toHaveLength(2);
  expect(view.container.querySelectorAll('.katex-display')).toHaveLength(1);
  expect(view.container.querySelector('code.language-python')?.textContent).toBe('print("$value$")\n');
  expect(screen.getByText('$literal$').tagName).toBe('CODE');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('retains diagram lifecycle while surrounding prose or diagram source changes', () => {
  const view = render(<HybridMarkdown source={'Before\n\n```mermaid\ngraph TD; A-->B\n```'} />);
  const diagram = screen.getByLabelText('Diagram source');
  view.rerender(<HybridMarkdown source={'Updated prose\n\n```mermaid\ngraph TD; A-->B\n```'} />);
  expect(screen.getByLabelText('Diagram source')).toBe(diagram);
  view.rerender(<HybridMarkdown source={'Updated prose\n\n```mermaid\ngraph TD; A-->C\n```'} />);
  expect(screen.getByLabelText('Diagram source')).toBe(diagram);
  expect(diagram.textContent).toBe('graph TD; A-->C');
  expect(lifecycle.mount).toHaveBeenCalledTimes(1);
  expect(lifecycle.unmount).not.toHaveBeenCalled();
  view.rerender(<HybridMarkdown source={'Updated prose\n\n```mermaid\ngraph TD; A-->C\n``'} />);
  expect(screen.queryByLabelText('Diagram source')).toBeNull();
  expect(lifecycle.unmount).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector('code')?.textContent).toContain('graph TD; A-->C');
});
it('renders a complete Mermaid fence using the shared preview without changing its source', () => {
  const source = 'Before\n\n~~~mermaid\ngraph TD; A-->B\n~~~\n\nAfter';
  render(<HybridMarkdown source={source} />);
  expect(screen.getByLabelText('Diagram source').textContent).toBe('graph TD; A-->B');
  expect(screen.getByText('Before')).toBeDefined();
  expect(screen.getByText('After')).toBeDefined();
});
it('does not render incomplete or non-Mermaid fences as diagrams', () => {
  const view = render(<HybridMarkdown source={'```mermaid\ngraph TD; A-->B'} />);
  expect(screen.queryByLabelText('Diagram source')).toBeNull();
  view.rerender(<HybridMarkdown source={'```python\n  x\n```'} />);
  expect(screen.queryByLabelText('Diagram source')).toBeNull();
  expect(view.container.querySelector('code')?.textContent).toBe('  x\n');
});

it.each([
  '> ```mermaid\n> graph TD; A-->B\n> ```',
  '- Diagram\n\n  ~~~mermaid\n  graph TD; A-->B\n  ~~~',
  '> - Diagram\n>\n>   ```mermaid\n>   graph TD; A-->B\n>   ```',
])('renders closed container-nested diagrams with container prefixes removed: %s', (source) => {
  render(<HybridMarkdown source={source} />);
  expect(screen.getByLabelText('Diagram source').textContent).toBe('graph TD; A-->B');
});

it.each([
  '> ```mermaid\n> graph TD; A-->B',
  '- Diagram\n\n  ~~~mermaid\n  graph TD; A-->B\n  ~~',
  '```mermaid\ngraph TD; A-->B\n> ```',
  '> ````mermaid\n> graph TD; A-->B\n> ```',
])('keeps incomplete or mismatched container fences literal: %s', (source) => {
  const view = render(<HybridMarkdown source={source} />);
  expect(screen.queryByLabelText('Diagram source')).toBeNull();
  expect(view.container.querySelector('code')?.textContent).toContain('graph TD; A-->B');
});
