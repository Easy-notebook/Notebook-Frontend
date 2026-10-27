import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@Services/notebook/NativeCellExecution', () => ({
  NativeCellExecution: class {
    execute = native.execute;
  },
}));
import useStore from './notebookStore';
import useCodeStore from './codeStore';

const original = useStore.getState();
beforeEach(() => {
  useCodeStore.getState().resetAll();
  native.execute.mockReset();
  useStore.setState({
    notebookId: 'batch-book',
    cells: [
      { id: 'title', type: 'markdown', content: '# Study' },
      {
        id: 'first',
        type: 'code',
        content: 'first source',
        language: 'aal',
        outputs: [{ type: 'text', content: 'old first' }],
      },
      {
        id: 'second',
        type: 'code',
        content: 'second source',
        language: 'aal',
        outputs: [{ type: 'text', content: 'old second' }],
      },
    ],
    tasks: [],
    currentRunningPhaseId: null,
    isExecuting: false,
    triggerAutoSave: vi.fn(),
  });
});
afterEach(() => {
  useCodeStore.getState().resetAll();
  useStore.setState(original, true);
});
it('runs all native code cells, preserves Markdown, and releases notebook activity', async () => {
  native.execute.mockImplementation(async (source) => ({
    status: 'ok',
    outputs: [{ type: 'text', content: source }],
  }));
  await useStore.getState().runAllCells();
  expect(native.execute.mock.calls.map((call) => call[0])).toEqual([
    'first source',
    'second source',
  ]);
  expect(useStore.getState().cells[0].content).toBe('# Study');
  expect(useStore.getState().cells[2].outputs?.[0].content).toBe('second source');
  expect(useStore.getState().isExecuting).toBe(false);
  expect(useStore.getState().currentRunningPhaseId).toBeNull();
});
it('rejects incomplete Run All without erasing unexecuted output', async () => {
  native.execute.mockResolvedValue({ status: 'error', error: 'E_COMPILE: invalid name' });
  await expect(useStore.getState().runAllCells()).rejects.toThrow('Cell first: E_COMPILE');
  expect(native.execute).toHaveBeenCalledOnce();
  expect(useStore.getState().cells[2].outputs?.[0].content).toBe('old second');
  expect(useStore.getState().isExecuting).toBe(false);
});
it('joins duplicate Run All without clearing output twice or dispatching twice', async () => {
  let resolve!: (result: unknown) => void;
  native.execute
    .mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    )
    .mockResolvedValueOnce({ status: 'ok', outputs: [{ type: 'text', content: 'second' }] });
  const first = useStore.getState().runAllCells();
  const duplicate = useStore.getState().runAllCells();
  await Promise.resolve();
  resolve({ status: 'ok', outputs: [{ type: 'text', content: 'first' }] });
  await Promise.all([first, duplicate]);
  expect(native.execute).toHaveBeenCalledTimes(2);
  expect(useStore.getState().isExecuting).toBe(false);
});
