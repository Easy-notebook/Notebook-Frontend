import { beforeEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from '@Store/AIAgentStore';
import type { QAItem } from '@Store/models/agent';
import { CapturedQAEvent } from './CapturedQAEvent';
import { SetErrorAction } from './actions/error/SetErrorAction';
import { TaskCompletedAction } from './actions/workflow/TaskCompletedAction';
import { TaskFailedAction } from './actions/workflow/TaskFailedAction';
import { WorkflowStageChangedAction } from './actions/workflow/WorkflowStageChangedAction';

const qa = (id: string, onProcess = false): QAItem => ({
  id,
  onProcess,
  type: 'user',
  content: id,
  timestamp: '',
  resolved: false,
});
beforeEach(() => useAIAgentStore.setState({ qaList: [qa('first', true), qa('second')] }));

it.each([
  [SetErrorAction, { error: 'test failure', details: { code: 1 } }, 'error'],
  [TaskCompletedAction, { taskName: 'task', result: { status: 'done' } }, 'task-completed'],
  [TaskFailedAction, { taskName: 'task', reason: 'failed' }, 'task-failed'],
  [WorkflowStageChangedAction, { stage: 'review', previousStage: 'plan' }, 'workflow-stage-change'],
] as const)(
  'captures the QA owner before %s waits for a notification',
  async (Action, payload, type) => {
    let release!: () => void;
    const showToast = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const execution = new Action().execute({ payload, showToast });
    expect(showToast).toHaveBeenCalledOnce();
    useAIAgentStore.setState({ qaList: [qa('second', true), qa('first')] });
    release();
    await execution;
    const list = useAIAgentStore.getState().qaList;
    expect(list.find((item) => item.id === 'first')?.toolCalls?.[0].type).toBe(type);
    expect(list.find((item) => item.id === 'second')?.toolCalls).toBeUndefined();
  }
);

it('uses explicit event ownership and detaches nested payload before recording', () => {
  const event = { type: 'task-completed', result: { answer: 1 } };
  const captured = new CapturedQAEvent(event, 'second');
  event.result.answer = 2;
  captured.record();
  expect(useAIAgentStore.getState().qaList[1].toolCalls?.[0].result).toEqual({ answer: 1 });
  expect(useAIAgentStore.getState().qaList[0].toolCalls).toBeUndefined();
});

it('does not redirect an explicitly missing or removed owner to another QA', () => {
  const removed = new CapturedQAEvent({ type: 'task-completed' });
  useAIAgentStore.getState().removeQA('first');
  removed.record();
  new CapturedQAEvent({ type: 'task-failed' }, 'missing').record();
  expect(useAIAgentStore.getState().qaList).toEqual([qa('second')]);
});
