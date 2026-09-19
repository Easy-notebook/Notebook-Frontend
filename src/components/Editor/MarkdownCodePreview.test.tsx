import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReactMarkdown from 'react-markdown';
import { remarkCompleteMermaid } from '@Utils/markdown/remarkCompleteMermaid';
import { markdownCodeComponents, markdownSoftLineComponents } from './MarkdownCodePreview';
vi.mock('./MermaidPreview', () => ({ MermaidPreview: ({ source }: { source: string }) => <div data-testid="diagram">{source}</div> }));

it('renders exactly one pre/code wrapper and retains code language and text', () => {
  const view = render(<ReactMarkdown components={markdownCodeComponents}>{'```c++\n  x\n```\n\n`inline`'}</ReactMarkdown>);
  expect(view.container.querySelectorAll('pre')).toHaveLength(1);
  expect(view.container.querySelector('pre > code')?.className).toBe('language-c++');
  expect(view.container.querySelector('pre > code')?.textContent).toBe('  x\n');
  expect(view.container.querySelector('p > code')?.textContent).toBe('inline');
});

it('renders only closed Mermaid fences, including after breaking and repairing a fence', () => {
  const source = '```mermaid\nflowchart LR; A-->B';
  const content = (value: string) => <ReactMarkdown remarkPlugins={[remarkCompleteMermaid]} components={markdownCodeComponents}>{value}</ReactMarkdown>;
  const view = render(content(source));
  expect(screen.queryByTestId('diagram')).toBeNull();
  expect(view.container.querySelector('pre > code')).toBeTruthy();
  view.rerender(content(source + '\n```'));
  expect(screen.getByTestId('diagram').textContent).toBe('flowchart LR; A-->B');
  expect(view.container.querySelector('pre')).toBeNull();
  view.rerender(content(source));
  expect(screen.queryByTestId('diagram')).toBeNull();
});

it('preserves prose soft breaks through layout without adding spaces to code or diagram source', () => {
  const source = 'First **bold**\nSecond\n\n```python\nx = 1\nprint(x)\n```\n\n```mermaid\nflowchart LR\n A-->B\n```';
  const view = render(<ReactMarkdown remarkPlugins={[remarkCompleteMermaid]}
    components={{ ...markdownCodeComponents, ...markdownSoftLineComponents }}>{source}</ReactMarkdown>);
  const paragraph = view.container.querySelector('p')!;
  expect(paragraph.style.whiteSpace).toBe('pre-line');
  expect(paragraph.textContent).toBe('First bold\nSecond');
  expect(paragraph.querySelector('strong')?.textContent).toBe('bold');
  expect(view.container.querySelector('pre > code')?.textContent).toBe('x = 1\nprint(x)\n');
  expect(screen.getByTestId('diagram').textContent).toBe('flowchart LR\n A-->B');
});
