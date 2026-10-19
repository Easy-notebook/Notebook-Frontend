import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useNotebookStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { useWorkflowStateMachine } from './workflowStateMachine';
import { useAIPlanningContextStore } from './aiPlanningContext';
import useScriptStore from './useScriptStore';
import { createInitialStateJSON } from '@Store/models';
import type { ExecutionResult } from '@Store/models/code';

const notebook = useNotebookStore.getState();
const code = useCodeStore.getState();
const workflow = useWorkflowStateMachine.getState();
const planning = useAIPlanningContextStore.getState();
beforeEach(() => {
  useNotebookStore.setState({
    notebookId: 'a',
    cells: [{ id: 'code', type: 'code', content: 'print(1)' }],
  });
  useWorkflowStateMachine.setState({ stateJSON: createInitialStateJSON() });
  useAIPlanningContextStore.setState({ effect: { current: [], history: [] } });
  useCodeStore.setState({ setCellMode: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useNotebookStore.setState(notebook, true);
  useCodeStore.setState(code, true);
  useWorkflowStateMachine.setState(workflow, true);
  useAIPlanningContextStore.setState(planning, true);
});
it('publishes all outputs once without modifying the previous workflow snapshot', async () => {
  const outputs = [
    { type: 'text', content: 'one' },
    { type: 'image', content: 'two' },
    { type: 'error', content: 'three' },
  ];
  useCodeStore.setState({
    executeCell: vi.fn().mockResolvedValue({ success: false, outputs, error: 'three' }),
  });
  const previous = useWorkflowStateMachine.getState().stateJSON;
  const publish = vi.spyOn(useWorkflowStateMachine.getState(), 'setState');
  expect(await useScriptStore.getState().execCodeCell('code')).toBe('three');
  expect(previous.state.effects.current).toEqual([]);
  expect(publish).toHaveBeenCalledOnce();
  expect(useWorkflowStateMachine.getState().stateJSON.state.effects.current).toEqual([
    { type: 'text', text: 'one', cell_ref: 'code' },
    { type: 'image_url', image_url: 'two', cell_ref: 'code' },
    {
      type: 'error',
      error: { name: 'ExecutionError', message: 'three', traceback: [] },
      cell_ref: 'code',
    },
  ]);
  expect(useAIPlanningContextStore.getState().effect.current).toEqual(['one', 'two', 'three']);
});
it.each(['switch', 'away-and-back', 'delete-and-recreate'])(
  'discards late outputs after %s',
  async (change) => {
    let finish!: (value: ExecutionResult) => void;
    useCodeStore.setState({
      executeCell: vi.fn(
        () =>
          new Promise<ExecutionResult>((resolve) => {
            finish = resolve;
          })
      ),
    });
    const pending = useScriptStore.getState().execCodeCell('code');
    if (change === 'delete-and-recreate') {
      const cells = useNotebookStore.getState().cells;
      useNotebookStore.setState({ cells: [] });
      useNotebookStore.setState({ cells });
    } else {
      useNotebookStore.setState({ notebookId: 'b' });
      if (change === 'away-and-back') useNotebookStore.setState({ notebookId: 'a' });
    }
    finish({ success: true, outputs: [{ type: 'text', content: 'stale' }] });
    expect(await pending).toBe(false);
    expect(useWorkflowStateMachine.getState().stateJSON.state.effects.current).toEqual([]);
    expect(useAIPlanningContextStore.getState().effect.current).toEqual([]);
  }
);
it('cancels pending debug focus on navigation even when returning to the same notebook', async () => {
  vi.useFakeTimers();
  const focus = vi.fn();
  useNotebookStore.setState({ setCurrentCell: focus });
  useCodeStore.setState({
    executeCell: vi.fn().mockResolvedValue({ success: false, error: 'failed' }),
  });
  await useScriptStore.getState().execCodeCell('code', true, true);
  expect(vi.getTimerCount()).toBe(1);
  useNotebookStore.setState({ notebookId: 'b' });
  useNotebookStore.setState({ notebookId: 'a' });
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(focus).not.toHaveBeenCalled();
});
it('focuses the owned failed cell after the debug delay and releases its timer', async () => {
  vi.useFakeTimers();
  const focus = vi.fn();
  useNotebookStore.setState({ setCurrentCell: focus });
  useCodeStore.setState({
    executeCell: vi.fn().mockResolvedValue({ success: false, error: 'failed' }),
  });
  await useScriptStore.getState().execCodeCell('code', true, true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(focus).toHaveBeenCalledExactlyOnceWith('code');
  expect(vi.getTimerCount()).toBe(0);
});
it('allows kernel initialization to assign an ID to the unsaved notebook', async () => {
  useNotebookStore.setState({ notebookId: null });
  const outputs = [{ type: 'text', content: 'fresh' }];
  useCodeStore.setState({
    executeCell: vi.fn(async () => {
      useNotebookStore.setState({ notebookId: 'created' });
      return { success: true, outputs };
    }),
  });
  expect(await useScriptStore.getState().execCodeCell('code')).toBe(outputs);
  expect(useAIPlanningContextStore.getState().effect.current).toEqual(['fresh']);
});

it('reads stored error outputs only while the original cell is still owned', async () => {
  useNotebookStore.setState({
    cells: [
      {
        id: 'code',
        type: 'code',
        content: '',
        outputs: [{ type: 'error', content: 'stored error' }],
      },
    ],
  });
  useCodeStore.setState({
    executeCell: vi.fn().mockResolvedValue({ success: false, error: 'failed', outputs: [] }),
  });
  await useScriptStore.getState().execCodeCell('code');
  expect(useAIPlanningContextStore.getState().effect.current).toEqual(['stored error']);
});
it('stops secondary publication when a workflow subscriber navigates synchronously', async () => {
  useCodeStore.setState({
    executeCell: vi.fn().mockResolvedValue({
      success: false,
      error: 'failed',
      outputs: [{ type: 'text', content: 'old notebook output' }],
    }),
  });
  const stop = useWorkflowStateMachine.subscribe(() => {
    useNotebookStore.setState({ notebookId: 'b' });
  });
  try {
    expect(await useScriptStore.getState().execCodeCell('code', true, true)).toBe(false);
    expect(useAIPlanningContextStore.getState().effect.current).toEqual([]);
  } finally {
    stop();
  }
});
it('releases the notebook subscription when execution rejects', async () => {
  const subscribe = useNotebookStore.subscribe;
  const release = vi.fn();
  vi.spyOn(useNotebookStore, 'subscribe').mockImplementation((listener) => {
    const stop = subscribe(listener);
    return () => {
      release();
      stop();
    };
  });
  useCodeStore.setState({ executeCell: vi.fn().mockRejectedValue(new Error('transport failed')) });
  expect(await useScriptStore.getState().execCodeCell('code')).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});
