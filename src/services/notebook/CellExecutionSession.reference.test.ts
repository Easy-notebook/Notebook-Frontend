import { expect, it, vi } from 'vitest';
import { CellExecutionSession } from './CellExecutionSession';

it('does not execute reference code through single or batch execution, even if its language is Python', async () => {
  const initialize = vi.fn();
  const execute = vi.fn();
  const session = new CellExecutionSession({
    notebookId: () => 'notebook',
    cell: () => ({
      content: 'print(1)',
      language: 'python',
      metadata: { executionPolicy: 'reference' },
    }),
    initialize,
    execute,
    watch: () => () => {},
    cancel: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
    outputs: vi.fn(),
    save: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    batchState: vi.fn(),
  });
  expect(await session.execute('reference')).toMatchObject({
    success: false,
    error: expect.stringContaining('reference'),
  });
  expect(await session.executeAll(['reference'])).toMatchObject({
    success: false,
    error: expect.stringContaining('reference'),
  });
  expect(initialize).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
