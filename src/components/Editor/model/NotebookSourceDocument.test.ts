import { expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { NotebookSourceDocument } from './NotebookSourceDocument';

it('restores boundary tokens and added cell identities across JSON checkpoints', () => {
  const original = new NotebookSourceDocument([
    { id: 'base', type: 'markdown', content: '# 中文🐍' },
  ]);
  let source = original.source;
  for (const type of ['code', 'raw', 'markdown'] as const)
    source = original.appendCell(source, type).source;
  const restored = NotebookSourceDocument.restore(
    JSON.parse(JSON.stringify(original.checkpoint()))
  );
  expect(restored.source).toBe(original.source);
  expect(restored.decode(source)).toEqual(original.decode(source));
  expect(restored.decode(original.source)).toEqual(original.decode(original.source));
  const next = restored.appendCell(source, 'code');
  expect(next.source).toContain(':4:start');
  const decoded = restored.decode(next.source);
  expect(new Set(decoded.map((cell) => cell.id)).size).toBe(5);
  expect(decoded[4].language).toBe('python');
});

it('restored source merges live metadata but rejects deletion of changed records', () => {
  const original = new NotebookSourceDocument([
    { id: 'base', type: 'code', language: 'python', content: 'old' },
  ]);
  const restored = NotebookSourceDocument.restore(
    JSON.parse(JSON.stringify(original.checkpoint()))
  );
  const live: Cell[] = [
    {
      id: 'base',
      type: 'code',
      language: 'python',
      content: 'old',
      outputs: [{ type: 'text', content: 'latest' }],
      metadata: { custom: 'live' },
    },
  ];
  const result = restored.reconcile(original.source.replace('old', 'new'), live);
  expect(result[0].content).toBe('new');
  expect(result[0].outputs).toBe(live[0].outputs);
  expect(result[0].metadata?.custom).toBe('live');
  expect(() => restored.reconcile('', live)).toThrow('Deleted cell');
});

it('permits deletion of unchanged serialized records but protects every changed field', () => {
  const base: Cell = {
    id: 'base',
    type: 'code',
    content: 'print(1)',
    language: 'python',
    outputs: [{ type: 'text', content: { nested: ['original'] } }],
    metadata: { custom: { enabled: true } },
    phaseId: 'phase',
    description: 'description',
  };
  const original = new NotebookSourceDocument([base]);
  const restored = NotebookSourceDocument.restore(
    JSON.parse(JSON.stringify(original.checkpoint()))
  );
  expect(restored.reconcile('', [JSON.parse(JSON.stringify(base))])).toEqual([]);
  const changes: Partial<Cell>[] = [
    { content: 'print(2)' },
    { language: 'javascript' },
    { type: 'raw' },
    { outputs: [{ type: 'text', content: { nested: ['new'] } }] },
    { metadata: { custom: { enabled: false } } },
    { phaseId: 'other' },
    { description: 'new' },
    { newField: true },
  ];
  for (const change of changes) {
    expect(() => restored.reconcile('', [{ ...base, ...change }])).toThrow('Deleted cell changed');
  }
});

it('does not inspect unchanged retained output payloads during deletion conflict checks', () => {
  const retained: Cell = {
    id: 'retained',
    type: 'raw',
    content: 'keep',
    get outputs(): never {
      throw new Error('retained outputs must not be inspected');
    },
  };
  const removed: Cell = { id: 'removed', type: 'raw', content: 'remove' };
  const document = new NotebookSourceDocument([retained, removed]);
  const source = document.source.split('\n\n')[0];
  expect(document.reconcile(source, [retained, { ...removed }])).toEqual([retained]);
});

it('rejects invalid checkpoint identities before constructing a source document', () => {
  const checkpoint = new NotebookSourceDocument([
    { id: 'base', type: 'markdown', content: '' },
  ]).checkpoint();
  expect(() => NotebookSourceDocument.restore({ ...checkpoint, version: 2 } as never)).toThrow(
    'Unsupported'
  );
  expect(() => NotebookSourceDocument.restore({ ...checkpoint, token: '.*' })).toThrow('token');
  expect(() =>
    NotebookSourceDocument.restore({ ...checkpoint, addedCells: [{ id: 'base', type: 'raw' }] })
  ).toThrow('Duplicate');
  expect(() =>
    NotebookSourceDocument.restore({ ...checkpoint, addedCells: [{ id: '', type: 'raw' }] })
  ).toThrow('Invalid');
  expect(() =>
    NotebookSourceDocument.restore({
      ...checkpoint,
      cells: [
        { id: 'base', type: 'markdown', content: `<!-- notebook:${checkpoint.token}:0:start -->` },
      ],
    })
  ).toThrow('collides');
});

it('validates before append without decoding edited bodies or reading output payloads', () => {
  const cell: Cell = {
    id: 'code',
    type: 'code',
    language: 'python',
    content: 'old',
    get outputs(): never {
      throw new Error('outputs must not be visited for validation');
    },
  };
  const document = new NotebookSourceDocument([cell]);
  const edited = document.source.replace('old', 'new');
  expect(() => document.appendCell(edited.replace(':0:end', ':9:end'), 'code')).toThrow('Unknown');
  const added = document.appendCell(edited, 'code');
  expect(added.source).toContain(':1:start');
  expect(added.source).toContain('new');
  expect(added.source).toContain('```python');
});

const cells: Cell[] = [
  { id: 'title', type: 'markdown', content: '# Notebook' },
  {
    id: 'code',
    type: 'hybrid',
    content: '```\nprint(1)',
    language: 'python',
    outputs: [{ type: 'text', content: 'large output' }],
    metadata: { custom: 'keep' },
  },
  { id: 'diagram', type: 'markdown', content: '```mermaid\nflowchart LR; A-->B\n```\n' },
  { id: 'raw', type: 'raw', content: '' },
];
it('merges source edits with live outputs and unrelated content edits', () => {
  const document = new NotebookSourceDocument(cells);
  const current = cells.map((cell) =>
    cell.id === 'code'
      ? { ...cell, outputs: [{ type: 'text', content: 'latest' }], metadata: { custom: 'latest' } }
      : cell.id === 'title'
        ? { ...cell, content: '# Renamed externally' }
        : cell
  );
  const next = document.reconcile(document.source.replace('print(1)', 'print(2)'), current);
  expect(next[0]).toBe(current[0]);
  expect(next[1].content).toBe('```\nprint(2)');
  expect(next[1].outputs).toBe(current[1].outputs);
  expect(next[1].metadata?.custom).toBe('latest');
});
it('rejects conflicting text, structure and deletion of externally changed cells', () => {
  const document = new NotebookSourceDocument(cells);
  const edited = document.source.replace('print(1)', 'print(2)');
  const current = cells.map((cell) =>
    cell.id === 'code' ? { ...cell, content: 'external' } : cell
  );
  expect(() => document.reconcile(edited, current)).toThrow('concurrently');
  expect(() => document.reconcile(edited, [...cells].reverse())).toThrow('structure');
  expect(() => document.reconcile('', current)).toThrow('Deleted cell');
  expect(current[1].content).toBe('external');
});
it('preserves all live changes when source was not edited', () => {
  const document = new NotebookSourceDocument(cells);
  const current = [...cells].reverse();
  expect(document.reconcile(document.source, current)).toEqual(current);
});
it('rejects ambiguous input identities', () => {
  expect(() => new NotebookSourceDocument([cells[0], cells[0]])).toThrow('Duplicate');
});
it('creates stable new cell identities and defaults new code cells to Python', () => {
  const document = new NotebookSourceDocument(cells);
  let source = document.appendCell(document.source, 'code').source;
  source = document.appendCell(source, 'markdown').source;
  const first = document.decode(source);
  const second = document.reconcile(source, cells);
  expect(first[4]).toMatchObject({ type: 'code', language: 'python', content: '', outputs: [] });
  expect(first[5]).toMatchObject({ type: 'markdown', content: '' });
  expect(second[4]).toBe(first[4]);
  expect(second[5]).toBe(first[5]);
  expect(new Set(first.map((cell) => cell.id)).size).toBe(first.length);
  expect(cells).toHaveLength(4);
});

it('does not reuse undone append identities when a different source branch is created', () => {
  const document = new NotebookSourceDocument(cells);
  const codeSource = document.appendCell(document.source, 'code').source;
  const code = document.decode(codeSource)[cells.length];
  const rawSource = document.appendCell(document.source, 'raw').source;
  const raw = document.decode(rawSource)[cells.length];
  expect(raw.id).not.toBe(code.id);
  expect(raw.type).toBe('raw');
  expect(document.decode(codeSource)[cells.length]).toBe(code);
  expect(document.decode(rawSource)[cells.length]).toBe(raw);
  expect(document.reconcile(codeSource, cells)[cells.length]).toBe(code);
  expect(document.reconcile(rawSource, cells)[cells.length]).toBe(raw);
});
it.each(['\r\n', '\r'])(
  'preserves original %j line endings for untouched cells after textarea projection',
  (newline) => {
    const originals: Cell[] = [
      { id: 'md-lines', type: 'markdown', content: `# Title${newline}Body${newline}` },
      { id: 'code-lines', type: 'code', content: `a${newline}b${newline}`, language: 'python' },
    ];
    const document = new NotebookSourceDocument(originals);
    const textarea = window.document.createElement('textarea');
    textarea.value = document.source;
    expect(textarea.value).toBe(document.source);
    expect(document.source).not.toContain('\r');
    const restored = document.decode(textarea.value);
    restored.forEach((cell, index) => expect(cell).toBe(originals[index]));
    const pasted = document.source.replace(/\n/g, '\r\n');
    document.decode(pasted).forEach((cell, index) => expect(cell).toBe(originals[index]));
    const edited = document.reconcile(textarea.value.replace('Body', 'Edited'), originals);
    expect(edited[0].content).toBe('# Title\nEdited\n');
    expect(edited[1]).toBe(originals[1]);
  }
);
it('round trips mixed cells without serializing outputs or cloning unchanged cells', () => {
  const document = new NotebookSourceDocument(cells);
  expect(document.source).not.toContain('large output');
  const restored = document.decode(document.source);
  restored.forEach((cell, index) => expect(cell).toBe(cells[index]));
});
it('edits code while retaining outputs, metadata and hybrid identity', () => {
  const document = new NotebookSourceDocument(cells);
  const restored = document.decode(document.source.replace('print(1)', 'print(2)'));
  expect(restored[1].content).toBe('```\nprint(2)');
  expect(restored[1].type).toBe('hybrid');
  expect(restored[1].outputs).toBe(cells[1].outputs);
  expect(restored[1].metadata).toBe(cells[1].metadata);
});
it('preserves broken fences as literal source instead of completing them', () => {
  const document = new NotebookSourceDocument(
    cells.map((cell) => (cell.id === 'code' ? { ...cell, type: 'code' as const } : cell))
  );
  const restored = document.decode(document.source.replace('````python', '``python'));
  expect(restored[1].type).toBe('markdown');
  expect(restored[1].content).toContain('``python');
  expect(restored[1].metadata?.sourceCellType).toBe('code');
});
it('projects mixed hybrid source without outer fences and retains hybrid identity after edits', () => {
  const content = 'Before\n```python\n  print(1)\n```\nAfter\n```mermaid\ngraph TD; A-->B\n```';
  const cell: Cell = {
    id: 'mixed',
    type: 'hybrid',
    content,
    outputs: [{ type: 'text', content: 'kept' }],
  };
  const document = new NotebookSourceDocument([cell]);
  expect(document.source).toContain(`:0:start -->\n${content}\n`);
  const [edited] = document.decode(document.source.replace('print(1)', 'print(2)'));
  expect(edited.type).toBe('hybrid');
  expect(edited.content).toBe(content.replace('print(1)', 'print(2)'));
  expect(edited.outputs).toBe(cell.outputs);
  const [broken] = document.decode(document.source.replace('```python', '``python'));
  expect(broken.type).toBe('hybrid');
  expect(broken.content).toContain('``python');
});
it('rejects damaged, duplicated and unmatched boundaries without mutating cells', () => {
  const document = new NotebookSourceDocument(cells);
  expect(() => document.decode(document.source.replace(':0:end', ':1:end'))).toThrow();
  expect(() => document.decode(document.source + '\n' + document.source)).toThrow();
  expect(() => document.decode(document.source.slice(1))).toThrow();
  expect(cells[1].content).toBe('```\nprint(1)');
});
it('supports explicit removal of complete cell sections', () => {
  const document = new NotebookSourceDocument(cells);
  const firstEnd = document.source.indexOf(':0:end -->') + ':0:end -->'.length;
  expect(document.decode(document.source.slice(firstEnd)).map((cell) => cell.id)).toEqual([
    'code',
    'diagram',
    'raw',
  ]);
});
