import { expect, it, vi } from 'vitest';
import { cellNavigationRouter } from './CellNavigationRouter';

it('routes among 1000 cells with one global listener and releases it on final unsubscribe', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const callbacks = Array.from({ length: 1000 }, () => vi.fn());
  const cleanup = callbacks.map((callback, index) =>
    cellNavigationRouter.subscribe(String(index), callback)
  );
  try {
    expect(add.mock.calls.filter(([name]) => name === 'cell-navigation')).toHaveLength(1);
    window.dispatchEvent(
      new CustomEvent('cell-navigation', { detail: { targetCellId: '501', direction: 'down' } })
    );
    expect(callbacks[501]).toHaveBeenCalledWith('down');
    expect(callbacks.reduce((count, callback) => count + callback.mock.calls.length, 0)).toBe(1);
    window.dispatchEvent(
      new CustomEvent('cell-navigation', { detail: { targetCellId: '501', direction: 'invalid' } })
    );
    expect(callbacks[501]).toHaveBeenCalledTimes(1);
  } finally {
    cleanup.forEach((release) => release());
    cleanup.forEach((release) => release());
    expect(remove.mock.calls.filter(([name]) => name === 'cell-navigation')).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  }
});
