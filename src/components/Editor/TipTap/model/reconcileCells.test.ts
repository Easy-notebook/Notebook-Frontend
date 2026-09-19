import { describe, expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { cellsChanged, reconcileCells } from './reconcileCells';

const cell = (id: string, type: Cell['type'], content: string): Cell => ({
  id,
  type,
  content,
  outputs: [],
});

describe('reconcileCells', () => {
  it('preserves cell-owned data across source-mode type transitions without copying outputs', () => {
    const original: Cell = {
      ...cell('code', 'code', 'print(1)'),
      language: 'python',
      enableEdit: false,
      phaseId: 'phase',
      description: 'important',
      outputs: [{ type: 'text', content: '1' }],
      metadata: { custom: { owner: 'notebook' } },
    };
    const source = reconcileCells(
      [
        {
          ...cell('code', 'markdown', '``python\nprint(1)\n```'),
          metadata: { editorMode: 'source' },
          enableEdit: true,
        },
      ],
      [original]
    )[0];
    expect(source).toMatchObject({
      type: 'markdown',
      phaseId: 'phase',
      description: 'important',
      enableEdit: false,
      metadata: { editorMode: 'source', custom: original.metadata!.custom },
    });
    expect(source.outputs).toBe(original.outputs);
    const restored = reconcileCells(
      [{ ...cell('code', 'code', 'print(2)'), language: 'python' }],
      [source]
    )[0];
    expect(restored.content).toBe('print(2)');
    expect(restored.outputs).toBe(original.outputs);
    expect(restored.metadata?.custom).toBe(original.metadata!.custom);
    expect(restored.metadata?.editorMode).toBeUndefined();
  });
  it('does not resurrect outputs explicitly cleared while in source mode', () => {
    const source = {
      ...cell('code', 'markdown', '```python\nprint(1)\n```'),
      metadata: { editorMode: 'source' },
      outputs: [],
    };
    const projected = {
      ...cell('code', 'code', 'print(1)'),
      outputs: [{ type: 'text', content: 'obsolete' }],
    };
    expect(reconcileCells([projected], [source])[0].outputs).toBe(source.outputs);
  });
  it('keeps store-owned execution data when document order changes', () => {
    const code = { ...cell('code', 'code', 'print(1)'), outputs: [{ type: 'text', content: '1' }] };
    const markdown = { ...cell('note', 'markdown', 'old'), metadata: { phaseId: 'phase-1' } };
    const result = reconcileCells(
      [cell('note', 'markdown', 'new'), cell('code', 'code', '')],
      [code, markdown]
    );

    expect(result.map((item) => item.id)).toEqual(['note', 'code']);
    expect(result[0]).toMatchObject({ content: 'new', metadata: { phaseId: 'phase-1' } });
    expect(result[1]).toBe(code);
  });

  it('preserves identity for unchanged cells and detects structural changes', () => {
    const stored = [cell('a', 'markdown', 'a'), cell('b', 'raw', 'b')];
    const same = reconcileCells(
      stored.map(({ ...item }) => item),
      stored
    );
    expect(cellsChanged(same, stored)).toBe(false);
    expect(cellsChanged([same[1], same[0]], stored)).toBe(true);
  });
});
