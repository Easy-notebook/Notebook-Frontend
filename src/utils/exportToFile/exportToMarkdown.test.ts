import { describe, expect, it, vi } from 'vitest';
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
import { notebookToMarkdown } from './exportToMarkdown';
import { scanFencedMarkdown } from '@Utils/markdown/fencedMarkdown';
import type { Cell } from '@Store/models';

describe('notebook Markdown export', () => {
  it('retains all cell kinds and Mermaid source without consulting rendered DOM', () => {
    const cells: Cell[] = [
      { id: 'md', type: 'markdown', content: '```mermaid\ngraph TD; A-->B\n```' },
      { id: 'hybrid', type: 'hybrid', language: 'javascript', content: '```javascript\nconsole.log(1)\n```' },
      { id: 'raw', type: 'raw', content: '**literal**' },
      { id: 'image', type: 'image', content: '![image](https://example.com/image.png)' },
      { id: 'link', type: 'link', content: '[file](https://example.com/file)' },
      {
        id: 'thinking',
        type: 'thinking',
        content: '',
        textArray: ['First thought', 'Second thought'],
      },
    ];
    const source = notebookToMarkdown(cells, new Date('2026-09-19T00:00:00Z'));
    for (const cell of cells.slice(0, 5)) expect(source).toContain(cell.content);
    expect(source).toContain('```javascript\nconsole.log(1)');
    expect(source).toContain('```text\n**literal**');
    expect(source).toContain('First thought\nSecond thought');
    expect(source).toContain('  code: 1');
    expect(source).toContain('  markdown: 1');
  });
  it('grows code and output fences so embedded delimiters do not corrupt source', () => {
    const payload = 'before\n```\nafter';
    const source = notebookToMarkdown([
      { id: 'code', type: 'code', content: payload, outputs: [{ type: 'text', content: payload }] },
    ]);
    const fences = scanFencedMarkdown(source).filter((part) => part.kind === 'fence');
    expect(fences).toHaveLength(2);
    expect(fences.map((fence) => fence.code)).toEqual([payload, payload]);
    expect(fences.map((fence) => fence.language)).toEqual(['python', '']);
    expect(source).toContain('````python');
  });
  it('exports hybrid prose, code and Mermaid as source without a nested outer code fence', () => {
    const content = 'Explanation\n\n```python\n  print(1)\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\nAfter';
    const source = notebookToMarkdown([{ id: 'hybrid', type: 'hybrid', content,
      outputs: [{ type: 'text', content: '1' }] }]);
    expect(source).toContain(content);
    const fences = scanFencedMarkdown(source).filter(part => part.kind === 'fence');
    expect(fences.map(fence => fence.language)).toEqual(['python', 'mermaid', '']);
    expect(fences[0].code).toBe('  print(1)');
    expect(fences[2].code).toBe('1');
  });
});
