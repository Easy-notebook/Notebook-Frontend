import { beforeEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { ActionCommandHandler } from './ActionCommandHandler';

const parser = vi.hoisted(() => ({ isActionCommand: vi.fn(), executeActionCommand: vi.fn() }));
vi.mock('./ActionCommandParser', () => ({ ActionCommandParser: parser }));
vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => ({
      notebookId: null,
      currentCellId: null,
      viewMode: 'script',
      currentPhaseId: null,
      currentStepIndex: 0,
      setIsRightSidebarCollapsed: vi.fn(),
    }),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
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
