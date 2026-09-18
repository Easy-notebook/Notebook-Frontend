import { describe, expect, it } from 'vitest';
import { formatCodeFence, scanFencedMarkdown, standaloneFence } from './fencedMarkdown';

describe('fenced Markdown scanner', () => {
  it('keeps inner Mermaid examples inside the outer code fence', () => {
    const source = '````markdown\n```mermaid\ngraph TD; A-->B\n```\n````';
    expect(scanFencedMarkdown(source)).toHaveLength(1);
    expect(standaloneFence(source)).toMatchObject({
      language: 'markdown',
      code: '```mermaid\ngraph TD; A-->B\n```',
    });
  });
  it('preserves CRLF, tilde delimiters and metadata', () => {
    const source = '~~~Python title="demo"\r\nprint(1)\r\n~~~~';
    expect(standaloneFence(source)).toMatchObject({
      source,
      language: 'python',
      code: 'print(1)',
      marker: '~',
    });
  });
  it('leaves incomplete and mismatched fences literal', () => {
    for (const source of ['```python\nx', '````python\nx\n```', '~~~python\nx\n```']) {
      expect(scanFencedMarkdown(source)).toEqual([{ kind: 'text', source }]);
    }
  });
  it('handles consecutive blocks without dropping separators', () => {
    const source = 'before\n```python\nx\n```\n~~~mermaid\ngraph TD\n~~~\nafter';
    const parts = scanFencedMarkdown(source);
    expect(parts.map((part) => part.source).join('')).toBe(source);
    expect(parts.filter((part) => part.kind === 'fence')).toHaveLength(2);
    expect(standaloneFence(source)).toBeUndefined();
  });
  it('grows generated delimiters to preserve embedded closing lines', () => {
    const code = 'example\n`````\nend';
    expect(standaloneFence(formatCodeFence(code, 'python'))?.code).toBe(code);
  });
});
