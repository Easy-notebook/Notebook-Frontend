import { describe, expect, it } from 'vitest';
import useStore from './notebookStore';

describe('cell publication identity', () => {
  it('retains unchanged cells and outputs when one Markdown cell changes', () => {
    const original = useStore.getState().cells;
    try {
      useStore.getState().setCells([
        { id: 'title', type: 'markdown', content: '# Notebook', outputs: [] },
        { id: 'body', type: 'markdown', content: 'Before', outputs: [] },
        { id: 'code', type: 'code', content: 'print(1)', outputs: [] },
      ]);
      const before = useStore.getState().cells;
      useStore
        .getState()
        .setCells(
          before.map((cell) => (cell.id === 'body' ? { ...cell, content: 'After' } : cell))
        );
      const after = useStore.getState().cells;
      expect(after[0]).toBe(before[0]);
      expect(after[1]).not.toBe(before[1]);
      expect(after[1].content).toBe('After');
      expect(after[2]).toBe(before[2]);
      expect(after[2].outputs).toBe(before[2].outputs);
    } finally {
      useStore.setState({ cells: original });
    }
  });
});
