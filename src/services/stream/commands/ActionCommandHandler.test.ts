import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useNotebookStore from '@Store/notebookStore';
import { ActionCommandHandler } from './ActionCommandHandler';

const parser = vi.hoisted(() => ({ isActionCommand: vi.fn(), executeActionCommand: vi.fn() }));
vi.mock('./ActionCommandParser', () => ({ ActionCommandParser: parser }));
const originalNotebook = useNotebookStore.getState();
afterEach(() => useNotebookStore.setState(originalNotebook, true));

beforeEach(() => {
  vi.resetAllMocks();
  useNotebookStore.setState({
    notebookId: null,
    currentCellId: null,
    currentPhaseId: null,
    currentStepIndex: 0,
    viewMode: originalNotebook.viewMode,
  });
  useAIAgentStore.setState({ actions: [], qaList: [] });
  parser.isActionCommand.mockReturnValue(true);
});
const action = (content: string) => ({
  type: 'system_event' as const,
  content,
  result: '',
  relatedQAIds: [],
  cellId: null,
  viewMode: 'script',
  onProcess: true,
});

it('returns its own created ID even when a subscriber immediately inserts another action', () => {
  let inserted = false;
  const unsubscribe = useAIAgentStore.subscribe(() => {
    if (!inserted) {
      inserted = true;
      useAIAgentStore.getState().addAction(action('subscriber'));
    }
  });
  try {
    const id = useAIAgentStore.getState().addAction(action('requested'));
    const records = useAIAgentStore.getState().actions;
    expect(records[0].content).toBe('subscriber');
    expect(records.find((record) => record.id === id)?.content).toBe('requested');
  } finally {
    unsubscribe();
  }
});

it('completes its own history record and leaves earlier history untouched', async () => {
  const previous = useAIAgentStore.getState().addAction(action('previous'));
  parser.executeActionCommand.mockResolvedValue({ success: true, message: 'done' });
  await expect(ActionCommandHandler.handleCommand('/test', vi.fn())).resolves.toBe(true);
  const records = useAIAgentStore.getState().actions;
  expect(records.find((record) => record.id === previous)).toMatchObject({
    result: '',
    onProcess: true,
  });
  expect(records.find((record) => record.content === 'Command: /test')).toMatchObject({
    result: 'done',
    onProcess: false,
  });
  expect(parser.executeActionCommand).toHaveBeenCalledWith(
    '/test',
    expect.objectContaining({
      notebookId: undefined,
      currentCellId: undefined,
      currentPhaseId: undefined,
    })
  );
  expect(useAIAgentStore.getState().qaList).toHaveLength(2);
  expect(useAIAgentStore.getState().qaList.every((qa) => typeof qa.id === 'string')).toBe(true);
});

it('keeps concurrent command completions attached to their own records when they finish out of order', async () => {
  let finishFirst!: (result: { success: boolean; message: string }) => void;
  parser.executeActionCommand
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        })
    )
    .mockResolvedValueOnce({ success: true, message: 'second done' });
  const first = ActionCommandHandler.handleCommand('/first', vi.fn());
  await ActionCommandHandler.handleCommand('/second', vi.fn());
  expect(
    useAIAgentStore.getState().actions.find((record) => record.content === 'Command: /first')
      ?.onProcess
  ).toBe(true);
  finishFirst({ success: true, message: 'first done' });
  await first;
  const records = useAIAgentStore.getState().actions;
  expect(records.find((record) => record.content === 'Command: /first')).toMatchObject({
    result: 'first done',
    onProcess: false,
  });
  expect(records.find((record) => record.content === 'Command: /second')).toMatchObject({
    result: 'second done',
    onProcess: false,
  });
});

it.each([
  [new Error('parser failure'), 'parser failure'],
  ['plain failure', 'plain failure'],
  [{ message: 'remote failure' }, 'remote failure'],
  [null, 'Unknown error'],
  [Object.create(null), 'Unknown error'],
])(
  'settles admitted history when the parser unexpectedly rejects with %j',
  async (failure, message) => {
    parser.executeActionCommand.mockRejectedValue(failure);
    const showToast = vi.fn().mockResolvedValue(undefined);
    await expect(ActionCommandHandler.handleCommand('/failed', showToast)).resolves.toBe(true);
    const record = useAIAgentStore.getState().actions[0];
    expect(record).toMatchObject({
      onProcess: false,
      result: `Error: Failed to execute command\n${message}`,
    });
    expect(useAIAgentStore.getState().qaList[0]).toMatchObject({
      type: 'assistant',
      content: record.result,
    });
    expect(showToast).toHaveBeenCalledWith({
      type: 'error',
      message: `Failed to execute command\n${message}`,
    });
  }
);

it('settles command history before propagating a failed result notification', async () => {
  parser.executeActionCommand.mockResolvedValue({ success: true, message: 'executed' });
  await expect(
    ActionCommandHandler.handleCommand(
      '/done',
      vi.fn().mockRejectedValue(new Error('toast unavailable'))
    )
  ).rejects.toThrow('toast unavailable');
  expect(useAIAgentStore.getState().actions[0]).toMatchObject({
    onProcess: false,
    result: 'executed',
  });
});

it('preserves warning severity for action notifications', async () => {
  parser.executeActionCommand.mockImplementation(async (_command, context) => {
    await context.showToast({ type: 'warning', message: 'review this action' });
    return { success: true, message: 'done' };
  });
  const showToast = vi.fn().mockResolvedValue(undefined);
  await ActionCommandHandler.handleCommand('/warning', showToast);
  expect(showToast).toHaveBeenNthCalledWith(1, { type: 'warning', message: 'review this action' });
});

it.each([false, true])(
  'suppresses late command results after navigation (return=%s)',
  async (returnToOwner) => {
    useNotebookStore.setState({ notebookId: 'a' });
    let finish!: (value: { success: boolean; message: string }) => void;
    parser.executeActionCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const toast = vi.fn();
    const pending = ActionCommandHandler.handleCommand('/pending', toast);
    const context = parser.executeActionCommand.mock.calls[0][1];
    useNotebookStore.setState({ notebookId: 'b' });
    if (returnToOwner) useNotebookStore.setState({ notebookId: 'a' });
    expect(context.signal.aborted).toBe(true);
    await context.showToast({ type: 'success', message: 'late action toast' });
    finish({ success: true, message: 'late result' });
    await pending;
    expect(toast).not.toHaveBeenCalled();
    expect(useAIAgentStore.getState().qaList).toHaveLength(1);
    expect(useAIAgentStore.getState().actions[0]).toMatchObject({ onProcess: false });
    expect(useAIAgentStore.getState().actions[0].result).toContain(
      'Action notebook context changed'
    );
  }
);

it('rejects command admission if sidebar publication navigates', async () => {
  useNotebookStore.setState({ notebookId: 'a', isRightSidebarCollapsed: true });
  const stop = useNotebookStore.subscribe((state) => {
    if (state.notebookId === 'a' && !state.isRightSidebarCollapsed)
      useNotebookStore.setState({ notebookId: 'b' });
  });
  try {
    await ActionCommandHandler.handleCommand('/pending', vi.fn());
    expect(parser.executeActionCommand).not.toHaveBeenCalled();
    expect(useAIAgentStore.getState().actions).toHaveLength(0);
  } finally {
    stop();
  }
});

it('suppresses presentation if settling history navigates synchronously', async () => {
  useNotebookStore.setState({ notebookId: 'a' });
  parser.executeActionCommand.mockResolvedValue({ success: true, message: 'done' });
  const stop = useAIAgentStore.subscribe((state) => {
    if (state.actions[0]?.onProcess === false) useNotebookStore.setState({ notebookId: 'b' });
  });
  const toast = vi.fn();
  try {
    await ActionCommandHandler.handleCommand('/done', toast);
    expect(useAIAgentStore.getState().actions[0]).toMatchObject({
      onProcess: false,
      result: 'done',
    });
    expect(useAIAgentStore.getState().qaList).toHaveLength(1);
    expect(toast).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});
