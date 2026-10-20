import { expect, it } from 'vitest';
import { WorkflowStreamTrace } from './WorkflowStreamTrace';

it('keeps interleaved traces independent and settles interrupted actions', () => {
  const first = new WorkflowStreamTrace('planning');
  const second = new WorkflowStreamTrace('planning');
  first.actionReceived(0, 'first');
  first.actionExecutionStart(0);
  second.actionReceived(0, 'second');
  second.actionExecutionStart(0);
  first.finish('cancelled');
  second.actionExecutionEnd(0);
  second.finish('completed');
  expect(first.snapshot()).toMatchObject({
    phase: 'cancelled',
    actions: [{ actionType: 'first', phase: 'cancelled' }],
  });
  expect(second.snapshot()).toMatchObject({
    phase: 'completed',
    actions: [{ actionType: 'second', phase: 'completed' }],
  });
  const terminal = first.snapshot();
  first.finish('completed');
  first.actionExecutionEnd(0);
  first.actionReceived(1, 'late');
  expect(first.snapshot()).toEqual(terminal);
  terminal.actions[0].phase = 'completed';
  expect(first.snapshot().actions[0].phase).toBe('cancelled');
});

it('preserves an action failure with an empty error message', () => {
  const trace = new WorkflowStreamTrace('generating');
  trace.actionReceived(0, 'failed');
  trace.actionExecutionStart(0);
  trace.actionExecutionEnd(0, '');
  trace.finish('failed');
  expect(trace.snapshot().actions).toMatchObject([{ phase: 'failed', error: '' }]);
});
