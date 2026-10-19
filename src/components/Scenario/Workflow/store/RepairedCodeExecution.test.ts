import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useNotebookStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { useWorkflowStateMachine } from './workflowStateMachine';
import { useAIPlanningContextStore } from './aiPlanningContext';
import { createInitialStateJSON } from '@Store/models';
import type { ExecutionResult } from '@Store/models/code';
import { RepairedCodeExecution } from './RepairedCodeExecution';
import { ExecAction as StreamExec } from '@/services/stream/actions/reflecting/ExecAction';
import { ExecNewVersionAction as StreamRepair } from '@/services/stream/actions/reflecting/ExecNewVersionAction';

const notebook = useNotebookStore.getState();
const code = useCodeStore.getState();
const workflow = useWorkflowStateMachine.getState();
const planning = useAIPlanningContextStore.getState();
beforeEach(() => {
  useNotebookStore.setState({
    notebookId: 'a',
    cells: [
      {
        id: 'code',
        type: 'code',
        content: 'print(1)',
        metadata: { debug: { fixedVersion: 'print(1)' } },
      },
    ],
  });
  useWorkflowStateMachine.setState({ stateJSON: createInitialStateJSON() });
  useAIPlanningContextStore.setState({ effect: { current: [], history: [] } });
  useCodeStore.setState({ setCellMode: vi.fn() });
});
afterEach(() => {
  vi.restoreAllMocks();
  useNotebookStore.setState(notebook, true);
  useCodeStore.setState(code, true);
  useWorkflowStateMachine.setState(workflow, true);
  useAIPlanningContextStore.setState(planning, true);
});
it.each<ExecutionResult>([
  { success: false, error: 'syntax error' },
  { success: false },
  { success: true },
  { success: true, outputs: [] },
])('records the actual success flag for result %j', async (result) => {
  useCodeStore.setState({ executeCell: vi.fn().mockResolvedValue(result) });
  const value = await new RepairedCodeExecution().run('code');
  expect(value).toBe(result.success ? result.outputs : result.error);
  expect(useNotebookStore.getState().cells[0].metadata?.debug).toMatchObject({
    executedAfterFix: true,
    executionSuccess: result.success,
    fixedVersion: 'print(1)',
  });
});
it('preserves metadata edited while code execution was pending', async () => {
  let resolve!: (value: ExecutionResult) => void;
  useCodeStore.setState({
    executeCell: vi.fn(
      () =>
        new Promise<ExecutionResult>((done) => {
          resolve = done;
        })
    ),
  });
  const pending = new RepairedCodeExecution().run('code');
  useNotebookStore.getState().updateCellMetadata('code', {
    label: 'latest',
    debug: { fixedVersion: 'newer code', bugAnalysis: 'latest analysis' },
  });
  resolve({ success: false, error: 'failed' });
  await pending;
  expect(useNotebookStore.getState().cells[0].metadata).toMatchObject({
    label: 'latest',
    debug: { fixedVersion: 'newer code', bugAnalysis: 'latest analysis', executionSuccess: false },
  });
});
it('does not execute after away-and-back navigation during effects reset', async () => {
  const execute = vi.fn();
  useCodeStore.setState({ executeCell: execute });
  const stop = useWorkflowStateMachine.subscribe(() => {
    useNotebookStore.setState({ notebookId: 'b' });
    useNotebookStore.setState({ notebookId: 'a' });
  });
  try {
    expect(await new RepairedCodeExecution().run('code')).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(useNotebookStore.getState().cells[0].metadata?.debug.executedAfterFix).toBeUndefined();
  } finally {
    stop();
  }
});
it('uses the same failure projection for the operation stream entry point', async () => {
  useCodeStore.setState({
    executeCell: vi.fn().mockResolvedValue({ success: false, error: 'failure' }),
  });
  await new StreamRepair().execute({
    payload: { cellId: 'code' },
    notebookId: 'a',
    showToast: vi.fn(),
  });
  expect(useNotebookStore.getState().cells[0].metadata?.debug).toMatchObject({
    executedAfterFix: true,
    executionSuccess: false,
  });
});
it('rejects an operation stream owned by another notebook before effects reset', async () => {
  const execute = vi.fn();
  useCodeStore.setState({ executeCell: execute });
  const previous = useWorkflowStateMachine.getState().stateJSON;
  await new StreamRepair().execute({
    payload: { cellId: 'code' },
    notebookId: 'other',
    showToast: vi.fn(),
  });
  expect(execute).not.toHaveBeenCalled();
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
});

it('does not clear effects when the requested code cell is missing', async () => {
  const execute = vi.fn();
  useCodeStore.setState({ executeCell: execute });
  const previous = useWorkflowStateMachine.getState().stateJSON;
  expect(await new RepairedCodeExecution().run('missing')).toEqual({
    success: false,
    error: 'No code cell found',
  });
  expect(execute).not.toHaveBeenCalled();
  expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
});

it.each([StreamRepair, StreamExec])(
  'rejects pre-cancelled %s before execution or effects reset',
  async (Action) => {
    const execute = vi.fn();
    useCodeStore.setState({ executeCell: execute });
    const previous = useWorkflowStateMachine.getState().stateJSON;
    const controller = new AbortController();
    controller.abort(new Error('caller cancelled'));
    await expect(
      new Action().execute({
        payload: { cellId: 'code' },
        showToast: vi.fn(),
        signal: controller.signal,
      })
    ).rejects.toThrow('caller cancelled');
    expect(execute).not.toHaveBeenCalled();
    expect(useWorkflowStateMachine.getState().stateJSON).toBe(previous);
  }
);
it.each([StreamRepair, StreamExec])(
  'suppresses late effects and debug completion for cancelled %s',
  async (Action) => {
    let finish!: (result: ExecutionResult) => void;
    useCodeStore.setState({
      executeCell: vi.fn(
        () =>
          new Promise<ExecutionResult>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const controller = new AbortController();
    const pending = new Action().execute({
      payload: { cellId: 'code' },
      showToast: vi.fn(),
      signal: controller.signal,
    });
    const afterAdmission = useWorkflowStateMachine.getState().stateJSON;
    controller.abort(new Error('caller cancelled'));
    finish({ success: true, outputs: [{ type: 'text', content: 'late output' }] });
    await expect(pending).rejects.toThrow('caller cancelled');
    expect(useWorkflowStateMachine.getState().stateJSON).toBe(afterAdmission);
    expect(useAIPlanningContextStore.getState().effect.current).toEqual([]);
    expect(useNotebookStore.getState().cells[0].metadata?.debug.executedAfterFix).toBeUndefined();
  }
);
