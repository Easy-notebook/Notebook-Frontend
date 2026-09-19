import { expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { convertCellsToHtml } from './cellConverters';

const literal = '" onmouseover="alert(1)" data-extra="<&';
it.each(['code', 'hybrid', 'markdown', 'raw', 'thinking', 'link', 'image'] as const)(
  'preserves %s identity without turning imported text into attributes',
  (type) => {
    const cell: Cell = { id: literal, type, content: 'text', outputs: [] };
    const root = document.createElement('div');
    root.innerHTML = convertCellsToHtml([cell], false);
    expect(root.firstElementChild?.getAttribute('data-cell-id')).toBe(literal);
    expect(root.querySelector('[onmouseover], [data-extra]')).toBeNull();
  }
);
it('escapes source IDs, title decorations, code language, agent names and attachment Markdown', () => {
  const cases: Array<{ cell: Cell; attribute: string; expected: string; frame?: boolean }> = [
    {
      cell: {
        id: literal,
        type: 'markdown',
        content: 'source',
        metadata: { editorMode: 'source' },
      },
      attribute: 'data-cell-id',
      expected: literal,
    },
    {
      cell: {
        id: 'title',
        type: 'markdown',
        content: '# Title',
        metadata: { cover: literal, icon: literal },
      },
      attribute: 'data-cover',
      expected: literal,
      frame: true,
    },
    {
      cell: { id: 'code', type: 'code', content: '', language: literal },
      attribute: 'data-language',
      expected: literal,
    },
    {
      cell: { id: 'thinking', type: 'thinking', content: '', agentName: literal },
      attribute: 'data-agent-name',
      expected: literal,
    },
    {
      cell: { id: 'link', type: 'link', content: `[${literal}](https://example.com)` },
      attribute: 'data-markdown',
      expected: `[${literal}](https://example.com)`,
    },
  ];
  for (const { cell, attribute, expected, frame } of cases) {
    const root = document.createElement('div');
    root.innerHTML = convertCellsToHtml([cell], frame ?? false);
    expect(root.firstElementChild?.getAttribute(attribute)).toBe(expected);
    expect(root.querySelector('[onmouseover], [data-extra]')).toBeNull();
  }
});
