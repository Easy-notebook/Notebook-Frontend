import { expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { NotebookSourceDocument } from './NotebookSourceDocument';

it('validates before append without decoding edited bodies or reading output payloads', () => {
  const cell: Cell = { id: 'code', type: 'code', language: 'python', content: 'old',
    get outputs(): never { throw new Error('outputs must not be visited for validation'); },
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
  const document = new NotebookSourceDocument(cells.map(cell => cell.id === 'code' ? { ...cell, type: 'code' as const } : cell));
  const restored = document.decode(document.source.replace('````python', '``python'));
  expect(restored[1].type).toBe('markdown');
  expect(restored[1].content).toContain('``python');
  expect(restored[1].metadata?.sourceCellType).toBe('code');
});
it('projects mixed hybrid source without outer fences and retains hybrid identity after edits', () => {
  const content = 'Before\n```python\n  print(1)\n```\nAfter\n```mermaid\ngraph TD; A-->B\n```';
  const cell: Cell = { id: 'mixed', type: 'hybrid', content, outputs: [{ type: 'text', content: 'kept' }] };
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
