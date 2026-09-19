import { describe, expect, it, vi } from 'vitest';
import {
  formatCodeFence,
  iterateFencedMarkdown,
  scanFencedMarkdown,
  standaloneFence,
  firstExecutableFence,
} from './fencedMarkdown';

describe('fenced Markdown scanner', () => {
  it('selects the first complete non-diagram fence with exact source offsets', () => {
    const diagram = '```MERMAID\r\ngraph TD; A-->B\r\n```';
    const code = '~~~typescript custom\r\nconst value = 1\r\n~~~~';
    const source = diagram + '\r\nprose\r\n' + code + '\r\n```python\nsecond\n```';
    const result = firstExecutableFence(source)!;
    expect(result.language).toBe('typescript');
    expect(result.code).toBe('const value = 1');
    expect(source.slice(result.start, result.end)).toBe(code);
  });

  it.each([
    'only prose',
    '```mermaid\ngraph TD; A-->B\n```',
    '````mermaid\ngraph TD; A-->B\n```\n~~~python\nhidden\n~~~',
    '~~~python\nincomplete',
  ])('does not invent executable code from an incomplete or diagram-only source: %s', source => {
    expect(firstExecutableFence(source)).toBeUndefined();
  });

  it('stops line iteration at the first executable fence instead of scanning a large suffix', () => {
    const source = '```mermaid\ngraph TD; A-->B\n```\n~~~python\nx\n~~~\n' + 'trailing prose\n'.repeat(10000);
    const original = String.prototype.matchAll;
    let visited = 0;
    const spy = vi.spyOn(String.prototype, 'matchAll').mockImplementation(function (this: string, regexp: RegExp) {
      const iterator = original.call(this, regexp);
      return (function* () {
        for (const match of iterator) { visited++; yield match; }
      })() as ReturnType<typeof original>;
    });
    try {
      expect(firstExecutableFence(source)?.code).toBe('x');
      expect(visited).toBe(6);
    } finally {
      spy.mockRestore();
    }
  });
  it('round-trips Unicode and delimiter-like payloads across newline and marker combinations', () => {
    for (const newline of ['\n', '\r\n', '\r']) {
      for (const marker of ['`', '~'] as const) {
        for (const ending of ['', newline, newline + newline]) {
          const code =
            ['  print("中文 🐍")', marker.repeat(3), '', '\t' + marker.repeat(7), 'end'].join(
              newline
            ) + ending;
          const formatted = formatCodeFence(code, 'python', marker);
          expect(standaloneFence(formatted)?.code).toBe(code);
          const mixed = '前文' + newline + formatted + newline + '后文';
          const parts = scanFencedMarkdown(mixed);
          expect(parts.map((part) => part.source).join('')).toBe(mixed);
          expect(parts.filter((part) => part.kind === 'fence')).toHaveLength(1);
        }
      }
    }
  });
  it.each([
    ['\n', '\r\n'],
    ['\r\n', '\n'],
    ['\r', '\n'],
    ['\n', '\r'],
  ])('removes the actual closing separator with mixed %j / %j newlines', (opening, closing) => {
    const source = `\`\`\`python${opening}print(1)${closing}\`\`\``;
    expect(standaloneFence(source)).toMatchObject({ code: 'print(1)', source, newline: opening });
  });
  it.each(['', '\r', '\n', '\r\n', '\r\r', '\n\n'])(
    'preserves payload trailing bytes %j through formatting',
    (ending) => {
      const code = `print(1)${ending}`;
      expect(standaloneFence(formatCodeFence(code, 'python'))?.code).toBe(code);
    }
  );
  it.each(['\n', '\r\n', '\r'])('scans consecutive candidate lines with %j newlines', (newline) => {
    const code = ['```', '  `````\t', '~~~~~~~', '    ````````', '```not-a-close', 'end'].join(
      newline
    );
    expect(formatCodeFence(code, 'python').startsWith('``````python\n')).toBe(true);
    expect(formatCodeFence(code, 'text', '~').startsWith('~~~~~~~~text\n')).toBe(true);
  });
  it('preserves large payloads without changing the streaming scanner contract', () => {
    const code = 'ordinary line\n'.repeat(100000) + '```';
    const source = formatCodeFence(code, 'python');
    const iterator = iterateFencedMarkdown(source);
    expect(iterator.next().value).toMatchObject({ kind: 'fence', code });
    expect(iterator.next().done).toBe(true);
    expect(standaloneFence(source)?.code).toBe(code);
  });
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
