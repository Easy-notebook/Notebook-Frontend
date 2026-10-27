import { afterEach, expect, it, vi } from 'vitest';
import useNotebookStore from '@Store/notebookStore';
import { executeAction } from './base';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../store/useScriptStore', () => ({
  useScriptStore: { getState: () => ({ execAction: mocks.execute }) },
}));
const original = useNotebookStore.getState();
afterEach(() => {
  useNotebookStore.setState(original, true);
  vi.resetAllMocks();
});
it.each(['text', 42])('normalizes primitive %s through the shared executor', async (value) => {
  mocks.execute.mockResolvedValue('done');
  await expect(executeAction('add-text', value)).resolves.toBe('done');
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
    { action: 'add-text', content: String(value) },
    undefined
  );
});
it('captures parameters before lazy loading and keeps the explicit action type authoritative', async () => {
  const params = { action: 'different', content: 'before', metadata: { label: 'before' } };
  const pending = executeAction('add-text', params);
  params.content = 'after';
  params.metadata.label = 'after';
  await pending;
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
    { action: 'add-text', content: 'before', metadata: { label: 'before' } },
    undefined
  );
});
it('rejects away-and-back notebook navigation before handing off to the executor', async () => {
  useNotebookStore.setState({ notebookId: 'a' });
  const pending = executeAction('add-text', 'old');
  useNotebookStore.setState({ notebookId: 'b' });
  useNotebookStore.setState({ notebookId: 'a' });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('forwards cancellation to the shared execution boundary', async () => {
  const abort = new AbortController();
  await executeAction('add-text', 'text', abort.signal);
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
    { action: 'add-text', content: 'text' },
    abort.signal
  );
});
it('rejects pre-cancelled calls without dispatch', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(executeAction('add-text', 'text', abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('propagates executor failures instead of reporting successful completion', async () => {
  const error = new Error('Unknown action type');
  mocks.execute.mockRejectedValue(error);
  await expect(executeAction('unknown')).rejects.toBe(error);
});
