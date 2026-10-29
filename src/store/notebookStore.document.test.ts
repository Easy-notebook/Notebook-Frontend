import { describe, it, expect, vi } from 'vitest';
import useStore from './notebookStore';
describe('document batch publication', () => {
  it('publishes title, content and derived task views together once', () => {
    const original = useStore.getState();
    let unsubscribe = () => {};
    try {
      useStore.getState().setCells(
        [
          { id: 'title', type: 'markdown', content: '# Before' },
          { id: 'request', type: 'markdown', content: '## Question' },
          { id: 'answer', type: 'markdown', content: 'Answer' },
        ],
        { notebookTitle: 'Before' }
      );
      const listener = vi.fn();
      unsubscribe = useStore.subscribe(listener);
      const cells = useStore
        .getState()
        .cells.map((cell) =>
          cell.id === 'title'
            ? { ...cell, content: '# After' }
            : cell.id === 'request'
              ? { ...cell, content: '## Better question' }
              : cell
        );
      useStore.getState().setCells(cells, { notebookTitle: 'After' });
      expect(listener).toHaveBeenCalledOnce();
      expect(useStore.getState().notebookTitle).toBe('After');
      const state = useStore.getState();
      expect(JSON.stringify(state.tasks)).toContain('Better question');
      expect(state.cells[2].content).toBe('Answer');
    } finally {
      unsubscribe();
      useStore.setState(original, true);
    }
  });
});
