import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoSavePageLifecycle } from './AutoSavePageLifecycle';
import { INITIAL_AUTOSAVE_STATE, type AutoSaveEventListener, type AutoSaveState } from './types';

const bindings: AutoSavePageLifecycle[] = [];
afterEach(() => {
  bindings.splice(0).forEach((binding) => binding.dispose());
});
function setup(dirty = false, initiallyHidden = false) {
  let state: AutoSaveState = { ...INITIAL_AUTOSAVE_STATE, isDirty: dirty };
  const listeners = new Set<AutoSaveEventListener>();
  const service = {
    getState: () => state,
    flush: vi.fn().mockResolvedValue(undefined),
    subscribe: (listener: AutoSaveEventListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const page = Object.assign(new EventTarget(), {
    visibilityState: initiallyHidden ? 'hidden' : 'visible',
  });
  const host = new EventTarget();
  const onError = vi.fn();
  const bind = () => {
    const binding = new AutoSavePageLifecycle(service, page as Document, host as Window, onError);
    bindings.push(binding);
    return binding;
  };
  const binding = bind();
  let revision = 0;
  const publish = (updates: Partial<AutoSaveState>, hasProgress = true) => {
    state = { ...state, ...updates };
    listeners.forEach((listener) =>
      listener({
        type: 'dirty_changed',
        state,
        progress:
          hasProgress && state.isDirty
            ? {
                notebookId: 'test',
                currentRevision: ++revision,
                committedRevision: 0,
                inFlightRevision: null,
                phase: 'scheduled',
                error: null,
              }
            : null,
        status: state.status,
        timestamp: 0,
      })
    );
  };
  const hide = () => {
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
  };
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    host.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { service, page, host, onError, binding, bind, publish, hide, unload, listeners };
}

// Drain the adapter's promise chain without advancing or relying on browser timers.
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('autosave page lifecycle', () => {
  it('guards only dirty pages and removes the guard after commit', async () => {
    const { publish, unload, service } = setup();
    expect(unload()).toBe(false);
    publish({ isDirty: true });
    expect(unload()).toBe(true);
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(1);
    publish({ isDirty: false });
    expect(unload()).toBe(false);
  });

  it('coalesces hidden/pagehide/unload triggers into one active save', async () => {
    const { service, hide, host, unload } = setup(true);
    let finish!: () => void;
    service.flush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    hide();
    host.dispatchEvent(new Event('pagehide'));
    expect(unload()).toBe(true);
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(1);
    finish();
    await settle();
  });

  it('retains dirty protection after failure and can retry on a later hide', async () => {
    const { service, onError, hide, unload } = setup(true);
    service.flush.mockRejectedValueOnce(new Error('quota'));
    hide();
    await settle();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'quota' }));
    hide();
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(2);
    expect(unload()).toBe(true);
  });

  it('flushes initial dirty hidden state and edits accepted while hidden', async () => {
    const { service, publish } = setup(true, true);
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(1);
    publish({ isDirty: false });
    publish({ isDirty: true });
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(2);
  });

  it('flushes edits admitted during a failed hidden flush without repeating the failure forever', async () => {
    const { service, publish, hide, onError } = setup(true);
    let fail!: (error: Error) => void;
    service.flush
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            fail = reject;
          })
      )
      .mockRejectedValue(new Error('still conflicted'));
    hide();
    await settle();
    publish({ isDirty: true });
    publish({ isDirty: true });
    expect(service.flush).toHaveBeenCalledTimes(1);
    fail(new Error('conflict'));
    await settle();
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(2);
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(2);
  });

  it('does not treat discarding another notebook as a newly accepted edit', async () => {
    const { service, publish, hide } = setup(true);
    let finish!: () => void;
    service.flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    hide();
    await settle();
    publish({ isDirty: true }, false);
    finish();
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(1);
  });

  it('includes edits arriving before flush starts without a redundant follow-up', async () => {
    const { service, publish, hide } = setup(true);
    hide();
    publish({ isDirty: true });
    await settle();
    expect(service.flush).toHaveBeenCalledTimes(1);
  });

  it.each(['clean', 'visible', 'disposed', 'closing'] as const)(
    'suppresses a queued hidden flush when the binding becomes %s',
    async (transition) => {
      const { service, publish, hide, page, binding } = setup(true);
      let finish!: () => void;
      service.flush.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      hide();
      await settle();
      publish({ isDirty: true });
      if (transition === 'clean') publish({ isDirty: false });
      if (transition === 'visible') page.visibilityState = 'visible';
      if (transition === 'disposed') binding.dispose();
      if (transition === 'closing') publish({ lifecycle: 'closing' });
      finish();
      await settle();
      expect(service.flush).toHaveBeenCalledTimes(1);
    }
  );

  it('does not admit saves during service shutdown', async () => {
    const { publish, hide, service, unload } = setup(true);
    publish({ lifecycle: 'closing' });
    hide();
    expect(unload()).toBe(true);
    await settle();
    expect(service.flush).not.toHaveBeenCalled();
  });

  it('releases only its own listeners and supports remount without disposing storage', async () => {
    const { binding, bind, host, hide, unload, service, listeners } = setup(true);
    const draftGuard = (event: Event) => event.preventDefault();
    host.addEventListener('beforeunload', draftGuard);
    binding.dispose();
    binding.dispose();
    expect(listeners.size).toBe(0);
    hide();
    await settle();
    expect(service.flush).not.toHaveBeenCalled();
    expect(unload()).toBe(true);
    host.removeEventListener('beforeunload', draftGuard);
    expect(unload()).toBe(false);
    bind();
    await settle();
    expect(listeners.size).toBe(1);
    expect(service.flush).toHaveBeenCalledTimes(1);
    expect(unload()).toBe(true);
  });

  it('ignores an event already captured for delivery when its binding is disposed', () => {
    const { binding, listeners, service, unload } = setup(true);
    const captured = [...listeners][0];
    binding.dispose();
    const state = service.getState();
    captured({ type: 'dirty_changed', state, progress: null, status: state.status, timestamp: 0 });
    expect(unload()).toBe(false);
  });

  it('cancels a not-yet-started flush on effect cleanup', async () => {
    const { binding, hide, service } = setup(true);
    hide();
    binding.dispose();
    await settle();
    expect(service.flush).not.toHaveBeenCalled();
  });
});
