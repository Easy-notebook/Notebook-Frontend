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

it('distinguishes delegated actions from executed ones and preserves empty error messages', () => {
  const trace = new WorkflowStreamTrace('generating');
  trace.actionReceived(0, 'deferred');
  trace.actionDeferred(0);
  trace.actionReceived(1, 'failed');
  trace.actionExecutionStart(1);
  trace.actionExecutionEnd(1, '');
  trace.finish('failed');
  expect(trace.snapshot().actions).toMatchObject([
    { phase: 'deferred' },
    { phase: 'failed', error: '' },
  ]);
  expect(trace.snapshot().actions[0].executionStartAt).toBeUndefined();
});
