import { expect, it, vi } from 'vitest';
import { Lexer } from 'marked';
import { MarkdownStructureIndex } from './structureIndex';

it.each([
  ['paragraph', 'changed paragraph', true],
  ['```python\n# code\n```', '```python\n## code\n```', true],
  ['# Title\n\nbody', '# Title\n\nnew body', true],
  ['', 'body', false],
  ['# Title', '# Renamed', false],
  ['body\n\n## Phase', '## Phase\n\nbody', false],
  ['paragraph', '## Phase', false],
])('compares structural summaries: %s → %s', (before, after, expected) => {
  const index = new MarkdownStructureIndex();
  const cells = [{ id: 'cell', type: 'markdown', content: before }];
  index.project(cells);
  expect(index.hasSameStructure(cells, [{ ...cells[0], content: after }])).toBe(expected);
  const tokenize = vi.spyOn(Lexer.prototype, 'blockTokens');
  try {
    index.project([{ ...cells[0], content: after }]);
    expect(tokenize).not.toHaveBeenCalled();
  } finally {
    tokenize.mockRestore();
  }
});

it('tokenizes one changed cell in a 1000-cell snapshot', () => {
  const index = new MarkdownStructureIndex();
  const cells = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    type: 'markdown',
    content: `Paragraph ${i}`,
  }));
  const before = index.project(cells);
  const tokenize = vi.spyOn(Lexer.prototype, 'blockTokens');
  try {
    const after = index.project(
      cells.map((cell, i) => ({ ...cell, content: i === 500 ? '## New phase' : cell.content }))
    );
    expect(tokenize).toHaveBeenCalledTimes(1);
    expect(after[499]).toBe(before[499]);
    expect(after[501]).toBe(before[501]);
    expect(after[500]).toEqual([{ type: 'heading', depth: 2, text: 'New phase' }]);
  } finally {
    tokenize.mockRestore();
  }
});

it('reparses only changed Markdown and drops removed document entries', () => {
  const index = new MarkdownStructureIndex();
  const cells = [
    { id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'body', type: 'markdown', content: 'first paragraph\n\nsecond paragraph' },
    { id: 'code', type: 'code', content: 'print(1)' },
  ];
  const tokenize = vi.spyOn(Lexer.prototype, 'blockTokens');
  try {
    const first = index.project(cells);
    expect(first[1]).toEqual([{ type: 'content' }]);
    tokenize.mockClear();
    const second = index.project(cells.map((cell) => ({ ...cell })));
    expect(tokenize).not.toHaveBeenCalled();
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    index.project([cells[0], { ...cells[1], content: 'updated' }, cells[2]]);
    expect(tokenize).toHaveBeenCalledTimes(1);
    index.project([]);
    tokenize.mockClear();
    index.project(cells);
    expect(tokenize).toHaveBeenCalledTimes(2);
  } finally {
    tokenize.mockRestore();
  }
});
