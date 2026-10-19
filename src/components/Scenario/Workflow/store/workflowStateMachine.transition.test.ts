import { afterEach, expect, it } from 'vitest';
import { createInitialStateJSON, WorkflowEvent, WorkflowState } from '@Store/models';
import { useWorkflowStateMachine } from './workflowStateMachine';

const initial = useWorkflowStateMachine.getState();
afterEach(() => useWorkflowStateMachine.setState(initial, true));

it.each(['transition', 'api'] as const)(
  'uses domain transitions and stores plain snapshots through %s',
  async (entry) => {
    const snapshot = createInitialStateJSON();
    snapshot.state.FSM.state = WorkflowState.STAGE_COMPLETED;
    snapshot.metadata = { marker: 'preserved' };
    const original = structuredClone(snapshot);
    useWorkflowStateMachine.setState({
      currentState: WorkflowState.STAGE_COMPLETED,
      stateJSON: snapshot,
      transitionHistory: [],
    });
    if (entry === 'transition') {
      await useWorkflowStateMachine
        .getState()
        .transition(WorkflowEvent.COMPLETE_WORKFLOW, { _auto_trigger: 'COMPLETE_WORKFLOW' });
    } else {
      await useWorkflowStateMachine
        .getState()
        .handleAPIResponse({ _auto_trigger: 'COMPLETE_WORKFLOW' }, 'completion');
    }
    const current = useWorkflowStateMachine.getState();
    expect(current.currentState).toBe(WorkflowState.COMPLETE);
    expect(current.stateJSON.state.FSM.state).toBe(WorkflowState.COMPLETE);
    expect(current.stateJSON.state.FSM.last_transition).toBe(WorkflowEvent.COMPLETE_WORKFLOW);
    expect(current.stateJSON.metadata).toEqual({ marker: 'preserved' });
    expect(snapshot).toEqual(original);
    expect(structuredClone(current.stateJSON)).toEqual(current.stateJSON);
    expect(Object.getPrototypeOf(current.stateJSON)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(current.stateJSON.state.FSM)).toBe(Object.prototype);
    if (entry === 'transition') {
      expect(current.transitionHistory).toHaveLength(1);
      expect(current.transitionHistory[0]).toMatchObject({
        from: WorkflowState.STAGE_COMPLETED,
        to: WorkflowState.COMPLETE,
        event: WorkflowEvent.COMPLETE_WORKFLOW,
      });
    }
  }
);
