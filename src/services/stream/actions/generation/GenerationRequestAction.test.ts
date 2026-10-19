import { beforeEach, expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { useAIAgentStore } from '@Store/AIAgentStore';
import type { QAItem } from '@Store/models/agent';
import { TriggerImageGenerationAction } from './TriggerImageGenerationAction';
import { TriggerWebpageGenerationAction } from './TriggerWebpageGenerationAction';
import { TriggerVideoGenerationAction } from './TriggerVideoGenerationAction';
import { RunCurrentCodeCellAction } from '../code/RunCurrentCodeCellAction';
import { CommunicateAgentAction } from '../agent/CommunicateAgentAction';
const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@Store/operatorStore', () => ({ default: { getState: () => ({ sendOperation: send }) } }));
const qa = (id: string, onProcess = false): QAItem => ({
  id,
  onProcess,
  type: 'user',
  content: id,
  timestamp: '',
  resolved: false,
});
beforeEach(() => {
  send.mockClear();
  useStore.setState({ notebookId: 'original', currentPhaseId: 'phase-a', currentStepIndex: 3 });
  useAIAgentStore.setState({ qaList: [qa('first', true), qa('second')] });
});

it.each([
  [TriggerImageGenerationAction, 'image', 'draw-image'],
  [TriggerWebpageGenerationAction, 'webpage', 'generate-webpage'],
  [TriggerVideoGenerationAction, 'video', 'create-video'],
] as const)(
  'captures the original request before %s loads its operator',
  async (Action, command, eventType) => {
    const payload = { prompt: 'original prompt', commandId: 'command-a' };
    const execution = new Action().execute({
      payload,
      showToast: vi.fn().mockResolvedValue(undefined),
    });
    payload.prompt = 'changed';
    useStore.setState({ notebookId: 'changed', currentPhaseId: 'phase-b', currentStepIndex: 7 });
    useAIAgentStore.setState({ qaList: [qa('second', true), qa('first')] });
    await execution;
    expect(send).toHaveBeenCalledExactlyOnceWith('original', {
      type: 'user_command',
      payload: {
        content: `/${command} original prompt`,
        commandId: 'command-a',
        current_view_mode: useStore.getState().viewMode,
        current_phase_id: 'phase-a',
        current_step_index: 3,
        notebook_id: 'original',
      },
    });
    expect(useAIAgentStore.getState().qaList[1].toolCalls).toEqual([
      { type: eventType, content: 'original prompt', agent: `${command}-generator` },
    ]);
    expect(useAIAgentStore.getState().qaList[0].toolCalls).toBeUndefined();
  }
);

it('honors explicit stream context and skips incomplete generation requests', async () => {
  const action = new TriggerImageGenerationAction();
  const showToast = vi.fn().mockResolvedValue(undefined);
  await action.execute({ payload: { prompt: 'test' }, showToast });
  expect(send).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  await action.execute({
    payload: { prompt: 'test', commandId: 'id', QId: 'second' },
    showToast,
    notebookId: 'explicit',
    currentPhaseId: 'explicit-phase',
    currentStepIndex: 0,
    viewMode: 'explicit-view',
  });
  expect(send).toHaveBeenCalledWith(
    'explicit',
    expect.objectContaining({
      payload: expect.objectContaining({
        notebook_id: 'explicit',
        current_phase_id: 'explicit-phase',
        current_step_index: 0,
        current_view_mode: 'explicit-view',
      }),
    })
  );
  expect(useAIAgentStore.getState().qaList[1].toolCalls).toHaveLength(1);
});

it('captures executed code and its QA before awaiting execution', async () => {
  let release!: () => void;
  const run = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { success: true };
  });
  const originalRun = useStore.getState().runSingleCell;
  useStore.setState({
    cells: [{ id: 'code', type: 'code', content: 'original code' }],
    currentCellId: 'code',
    runSingleCell: run,
  });
  try {
    const execution = new RunCurrentCodeCellAction().execute({ payload: {}, showToast: vi.fn() });
    useStore.setState({ cells: [{ id: 'code', type: 'code', content: 'changed code' }] });
    useAIAgentStore.setState({ qaList: [qa('second', true), qa('first')] });
    release();
    await execution;
    expect(useAIAgentStore.getState().qaList[1].toolCalls).toEqual([
      { type: 'execute-code', content: 'original code', agent: 'code-executor' },
    ]);
  } finally {
    useStore.setState({ runSingleCell: originalRun });
  }
});

it('records agent communication against an explicit QA without redirecting to the active QA', async () => {
  await new CommunicateAgentAction().execute({
    payload: { sourceAgent: 'a', targetAgent: 'b', message: 'message', QId: 'second' },
    showToast: vi.fn(),
  });
  expect(useAIAgentStore.getState().qaList[0].toolCalls).toBeUndefined();
  expect(useAIAgentStore.getState().qaList[1].toolCalls).toEqual([
    { type: 'agent-communication', content: 'message', agent: 'a', targetAgent: 'b' },
  ]);
});
