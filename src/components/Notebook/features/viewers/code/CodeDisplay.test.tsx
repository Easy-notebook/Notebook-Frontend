import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('@Editor/MermaidPreview', () => ({ MermaidPreview: ({ source }: { source: string }) => <div aria-label="Diagram source">{source}</div> }));
import CodeDisplay from './CodeDisplay';
afterEach(cleanup);

it.each(['typescript', 'ts', 'TypeScript'])('highlights %s instead of silently treating it as plain text', language => {
  const content = 'const value: number = 1;';
  const view = render(<CodeDisplay content={content} language={language} fileName="example.ts" />);
  expect(view.container.querySelector('code')?.className).toContain('language-typescript');
  const keyword = [...view.container.querySelectorAll('span')].find(node => node.textContent === 'const');
  expect(keyword?.style.color).toBeTruthy();
});

it('preserves fenced code text while displaying prose soft breaks', () => {
  const content = 'First\nSecond\n\n```python\nx = 1\nprint(x)\n```';
  const view = render(<CodeDisplay content={content} language="markdown" fileName="note.md" />);
  fireEvent.click(screen.getByTitle('Show preview'));
  expect(view.container.querySelector('code.language-python')?.textContent).toBe('x = 1\nprint(x)\n');
  expect(view.container.querySelector('p')?.style.whiteSpace).toBe('pre-line');
});

it('renders complete Mermaid fences but leaves damaged fences as literal source', () => {
  const view = render(<CodeDisplay content={'```mermaid\ngraph TD; A-->B\n```'} language="markdown" fileName="note.md" />);
  fireEvent.click(screen.getByTitle('Show preview'));
  expect(screen.getByLabelText('Diagram source').textContent).toBe('graph TD; A-->B');
  view.rerender(<CodeDisplay content={'```mermaid\ngraph TD; A-->B\n``'} language="markdown" fileName="note.md" />);
  expect(screen.queryByLabelText('Diagram source')).toBeNull();
  expect(view.container.querySelector('code')?.textContent).toContain('graph TD; A-->B');
});
