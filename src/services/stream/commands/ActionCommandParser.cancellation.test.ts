import { afterEach, expect, it, vi } from 'vitest';
import { ActionCommandParser } from './ActionCommandParser';
import { StreamAction, registerStreamAction, getStreamRegistry } from '../actions/base';
import type { StreamActionContext } from '../types';

const execute = vi.fn<(context: StreamActionContext) => Promise<void>>();
class PendingAction extends StreamAction {
  execute(context: StreamActionContext) {
    return execute(context);
  }
}
const actionType = 'test_command_cancellation';
afterEach(() => {
  getStreamRegistry().delete(actionType);
  execute.mockReset();
});
function setup() {
  registerStreamAction(actionType, PendingAction);
  return new AbortController();
}
it('does not enter an action with an already cancelled caller', async () => {
  const controller = setup();
  controller.abort(new Error('cancelled before admission'));
  expect(
    await ActionCommandParser.executeActionCommand(`/${actionType}`, { signal: controller.signal })
  ).toMatchObject({ success: false, error: 'cancelled before admission' });
  expect(execute).not.toHaveBeenCalled();
});
it('forwards cancellation and rejects late successful completion', async () => {
  const controller = setup();
  let finish!: () => void;
  execute.mockImplementation((context) => {
    expect(context.signal).toBe(controller.signal);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = ActionCommandParser.executeActionCommand(`/${actionType}`, {
    signal: controller.signal,
  });
  controller.abort(new Error('caller left'));
  finish();
  expect(await pending).toMatchObject({ success: false, error: 'caller left' });
});
it('preserves ordinary successful execution', async () => {
  const controller = setup();
  execute.mockResolvedValue(undefined);
  expect(
    await ActionCommandParser.executeActionCommand(`/${actionType}`, { signal: controller.signal })
  ).toMatchObject({ success: true });
  expect(controller.signal.aborted).toBe(false);
});
