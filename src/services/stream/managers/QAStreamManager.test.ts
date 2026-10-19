import { afterEach, expect, it, vi } from 'vitest';
import { qaStreamManager as manager } from './QAStreamManager';
afterEach(() => manager.clearStreamingQaId());
it('interrupts the previous occurrence exactly once on replacement', () => {
  const cancel = vi.fn();
  const signal = new AbortController();
  manager.setStreamingQaId('old', signal.signal, cancel);
  const replacement = manager.setStreamingQaId('next');
  expect(cancel).toHaveBeenCalledOnce();
  signal.abort();
  expect(cancel).toHaveBeenCalledOnce();
  expect(manager.capture()).toBe(replacement);
});
it('preserves a newer session created by the interrupted-answer callback', () => {
  const displaced = vi.fn();
  manager.setStreamingQaId('old', undefined, () => manager.setStreamingQaId('newest'));
  const requested = manager.setStreamingQaId('requested', undefined, displaced);
  expect(displaced).toHaveBeenCalledOnce();
  expect(manager.capture()).not.toBe(requested);
  expect(manager.getStreamingQaId()).toBe('newest');
});
it('releases an uninitialized replacement when prior cleanup throws', () => {
  const controller = new AbortController();
  const detach = vi.spyOn(controller.signal, 'removeEventListener');
  manager.setStreamingQaId('old', undefined, () => {
    throw new Error('cleanup failed');
  });
  expect(() => manager.setStreamingQaId('next', controller.signal)).toThrow('cleanup failed');
  expect(manager.isStreaming()).toBe(false);
  expect(detach).toHaveBeenCalledWith('abort', expect.any(Function));
});
it('does not clear a reentrant newer session when prior cleanup throws', () => {
  manager.setStreamingQaId('old', undefined, () => {
    manager.setStreamingQaId('newest');
    throw new Error('cleanup failed');
  });
  expect(() => manager.setStreamingQaId('next')).toThrow('cleanup failed');
  expect(manager.getStreamingQaId()).toBe('newest');
});
