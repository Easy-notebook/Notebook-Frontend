import { afterEach, expect, expectTypeOf, it, vi } from 'vitest';
import {
  StreamAction,
  type StreamActionConstructor,
  registerStreamAction,
  getStreamActionClass,
  clearStreamRegistry,
} from './base';
import type { StreamActionContext } from '../types';
import { ActionCommandParser } from '../commands/ActionCommandParser';

afterEach(clearStreamRegistry);

it('accepts concrete no-argument actions and excludes abstract or dependency-requiring constructors', () => {
  class ConcreteAction extends StreamAction {
    execute(): void {}
  }
  class RequiresDependency extends StreamAction {
    constructor(readonly dependency: string) {
      super();
    }
    execute(): void {}
  }
  expectTypeOf<typeof ConcreteAction>().toMatchTypeOf<StreamActionConstructor>();
  expectTypeOf<typeof StreamAction>().not.toMatchTypeOf<StreamActionConstructor>();
  expectTypeOf(RequiresDependency).not.toMatchTypeOf<StreamActionConstructor>();
  registerStreamAction('test_concrete', ConcreteAction);
  const Constructor = getStreamActionClass('test_concrete');
  expect(Constructor).toBe(ConcreteAction);
  expect(Constructor && new Constructor()).toBeInstanceOf(StreamAction);
});

it('executes a registered concrete action through the command entry point with its context', async () => {
  const execute = vi.fn();
  class CommandAction extends StreamAction {
    execute(context: StreamActionContext): void {
      execute(context);
    }
  }
  registerStreamAction('test_command', CommandAction);
  const showToast = vi.fn().mockResolvedValue(undefined);
  const result = await ActionCommandParser.executeActionCommand('/test_command --content hello', {
    notebookId: 'book',
    currentCellId: 'cell',
    showToast,
  });
  expect(result).toMatchObject({ success: true, actionType: 'test_command' });
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      notebookId: 'book',
      currentCellId: 'cell',
      showToast,
      payload: expect.objectContaining({ content: 'hello' }),
    })
  );
});

it('retains command failure reporting when a concrete action rejects', async () => {
  class FailingAction extends StreamAction {
    async execute(): Promise<void> {
      throw new Error('operation rejected');
    }
  }
  registerStreamAction('test_failure', FailingAction);
  await expect(
    ActionCommandParser.executeActionCommand('/test_failure', {})
  ).resolves.toMatchObject({
    success: false,
    actionType: 'test_failure',
    error: 'operation rejected',
  });
});

it.each([
  [null, 'Unknown error'],
  ['plain rejection', 'plain rejection'],
  [{ message: 'object rejection' }, 'object rejection'],
])('converts non-Error action rejection into a command failure: %j', async (failure, message) => {
  class FailingAction extends StreamAction {
    execute(): void {
      throw failure;
    }
  }
  registerStreamAction('test_non_error', FailingAction);
  await expect(
    ActionCommandParser.executeActionCommand('/test_non_error', {})
  ).resolves.toMatchObject({
    success: false,
    error: message,
  });
});

it('rejects a conflicting registration without replacing the owner or mutating the rejected class', () => {
  class First extends StreamAction {
    execute(): void {}
  }
  class Second extends StreamAction {
    static actionType = 'unchanged';
    execute(): void {}
  }
  registerStreamAction('owned', First);
  expect(() => registerStreamAction('owned', First)).not.toThrow();
  expect(() => registerStreamAction('owned', Second)).toThrow(
    'Stream action already registered: owned'
  );
  expect(getStreamActionClass('owned')).toBe(First);
  expect(Second.actionType).toBe('unchanged');
});
