import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ create: vi.fn(), restart: vi.fn(), adopt: vi.fn() }));
vi.mock('@Store/notebookStore', async () => {
  const { create } = await import('zustand');
  return {
    default: create(() => ({ notebookId: null as string | null, setNotebookId: io.adopt })),
  };
});
vi.mock('@Services/notebook/NotebookLifecycleService', () => ({
  NotebookLifecycleService: { initializeNotebook: io.create, restartNotebook: io.restart },
}));
import useCodeStore from './codeStore';
import useNotebookStore from './notebookStore';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const state = () => useCodeStore.getState();
beforeEach(() => {
  state().resetAll();
  vi.resetAllMocks();
  useNotebookStore.setState({ notebookId: null });
  io.create.mockResolvedValue({ status: 'ok', notebook_id: 'created' });
  io.restart.mockResolvedValue({ status: 'ok' });
  io.adopt.mockImplementation(async (id: string) => {
    useNotebookStore.setState({ notebookId: id });
  });
});
afterEach(() => state().resetAll());
it('shares concurrent initialization and publishes readiness only after adoption finishes', async () => {
  const activation = deferred<void>();
  io.adopt.mockImplementation((id: string) => {
    useNotebookStore.setState({ notebookId: id });
    return activation.promise;
  });
  const one = state().initializeKernel();
  const two = state().initializeKernel();
  expect(one).toBe(two);
  expect(io.create).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(io.adopt).toHaveBeenCalledOnce());
  expect(state().isKernelReady).toBe(false);
  activation.resolve();
  expect(await one).toBe('created');
  expect(await two).toBe('created');
  expect(io.adopt).toHaveBeenCalledExactlyOnceWith('created', { preserveContent: true });
  expect(state().isKernelReady).toBe(true);
});
it('does not overwrite a selected notebook when an old creation response arrives', async () => {
  const creation = deferred<unknown>();
  io.create.mockReturnValue(creation.promise);
  const pending = state().initializeKernel();
  useNotebookStore.setState({ notebookId: 'selected' });
  expect(await pending).toBe(false);
  creation.resolve({ status: 'ok', notebook_id: 'old' });
  await Promise.resolve();
  await Promise.resolve();
  expect(io.adopt).not.toHaveBeenCalled();
  expect(useNotebookStore.getState().notebookId).toBe('selected');
});
it('detects away-and-back transitions while creation is pending', async () => {
  const creation = deferred<unknown>();
  io.create.mockReturnValue(creation.promise);
  const pending = state().initializeKernel();
  useNotebookStore.setState({ notebookId: 'other' });
  useNotebookStore.setState({ notebookId: null });
  creation.resolve({ status: 'ok', notebook_id: 'old' });
  expect(await pending).toBe(false);
  expect(io.adopt).not.toHaveBeenCalled();
  expect(state().isKernelReady).toBe(false);
});
it('ignores an old adoption completion after a new notebook is ready', async () => {
  const activation = deferred<void>();
  io.adopt.mockImplementation((id: string) => {
    useNotebookStore.setState({ notebookId: id });
    return activation.promise;
  });
  const old = state().initializeKernel();
  await vi.waitFor(() => expect(io.adopt).toHaveBeenCalledOnce());
  useNotebookStore.setState({ notebookId: 'new' });
  expect(await state().initializeKernel()).toBe('new');
  activation.resolve();
  expect(await old).toBe(false);
  expect(state().isKernelReady).toBe(true);
  expect(state().error).toBeNull();
});
it('invalidates pending creation on reset and suppresses its later failure', async () => {
  const creation = deferred<unknown>();
  io.create.mockReturnValue(creation.promise);
  const pending = state().initializeKernel();
  state().resetAll();
  expect(await pending).toBe(false);
  creation.reject(new Error('obsolete'));
  await Promise.resolve();
  await Promise.resolve();
  expect(state().error).toBeNull();
  expect(state().isKernelReady).toBe(false);
});
it('rejects missing notebook IDs without publishing readiness and permits retry', async () => {
  io.create.mockResolvedValueOnce({ status: 'ok' });
  expect(await state().initializeKernel()).toBe(false);
  expect(state().isKernelReady).toBe(false);
  expect(state().error).toContain('ID');
  expect(io.adopt).not.toHaveBeenCalled();
  expect(await state().initializeKernel()).toBe('created');
  expect(state().error).toBeNull();
});
it('does not trust a stale ready flag when no notebook is selected', async () => {
  state().setKernelReady(true);
  expect(await state().initializeKernel()).toBe('created');
  expect(io.create).toHaveBeenCalledOnce();
});
it('preserves an existing notebook without creating it again or repeatedly publishing ready state', async () => {
  useNotebookStore.setState({ notebookId: 'existing' });
  expect(await state().initializeKernel()).toBe('existing');
  const changed = vi.fn();
  const unsubscribe = useCodeStore.subscribe(changed);
  expect(await state().initializeKernel()).toBe('existing');
  unsubscribe();
  expect(changed).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
});
it('shares restarts and lets initialize wait for the active restart', async () => {
  useNotebookStore.setState({ notebookId: 'existing' });
  state().setKernelReady(true);
  const restart = deferred<unknown>();
  io.restart.mockReturnValue(restart.promise);
  const one = state().restartKernel();
  const two = state().restartKernel();
  const initialize = state().initializeKernel();
  expect(io.restart).toHaveBeenCalledExactlyOnceWith('existing');
  expect(state().isKernelReady).toBe(false);
  restart.resolve({ status: 'ok' });
  expect(await one).toBe(true);
  expect(await two).toBe(true);
  expect(await initialize).toBe('existing');
});
it('suppresses a restart failure belonging to a notebook that is no longer selected', async () => {
  useNotebookStore.setState({ notebookId: 'existing' });
  const restart = deferred<unknown>();
  io.restart.mockReturnValue(restart.promise);
  const pending = state().restartKernel();
  useNotebookStore.setState({ notebookId: 'new' });
  await state().initializeKernel();
  restart.reject(new Error('old restart failure'));
  expect(await pending).toBe(false);
  await Promise.resolve();
  expect(state().isKernelReady).toBe(true);
  expect(state().error).toBeNull();
});
it('rejects restart without a selected notebook and does not race an active creation', async () => {
  expect(await state().restartKernel()).toBe(false);
  expect(io.restart).not.toHaveBeenCalled();
  const creation = deferred<unknown>();
  io.create.mockReturnValue(creation.promise);
  const pending = state().initializeKernel();
  expect(await state().restartKernel()).toBe(false);
  expect(io.restart).not.toHaveBeenCalled();
  creation.resolve({ status: 'ok', notebook_id: 'created' });
  expect(await pending).toBe('created');
});
it('explicit readiness publication supersedes an older pending initialization', async () => {
  const creation = deferred<unknown>();
  io.create.mockReturnValue(creation.promise);
  const pending = state().initializeKernel();
  state().setKernelReady(true);
  expect(await pending).toBe(false);
  creation.resolve({ status: 'ok', notebook_id: 'obsolete' });
  await Promise.resolve();
  expect(io.adopt).not.toHaveBeenCalled();
  expect(state().isKernelReady).toBe(true);
});
