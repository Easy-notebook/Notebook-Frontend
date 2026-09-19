import { describe, expect, it, vi } from 'vitest';
import { RouteTransitionCoordinator } from './RouteTransitionCoordinator';

describe('RouteTransitionCoordinator', () => {
  it('finishes cleanup before reconnecting and coalesces pending navigation', async () => {
    let release!: () => void;
    const cleanup = new Promise<void>(resolve => { release = resolve; });
    const events: string[] = [];
    const coordinator = new RouteTransitionCoordinator(async path => {
      events.push(`start:${path}`);
      if (path === '/') await cleanup;
      events.push(`end:${path}`);
    }, vi.fn());
    const settled = coordinator.request('/');
    await Promise.resolve();
    coordinator.request('/workspace/obsolete');
    coordinator.request('/workspace/current');
    expect(coordinator.getSnapshot()).toEqual({ status: 'pending', path: '/workspace/current' });
    expect(events).toEqual(['start:/']);
    release();
    await settled;
    expect(events).toEqual(['start:/', 'end:/', 'start:/workspace/current', 'end:/workspace/current']);
    expect(coordinator.getSnapshot()).toEqual({ status: 'ready', path: '/workspace/current' });
  });

  it('deduplicates requests including after completion', async () => {
    const transition = vi.fn(async () => {});
    const coordinator = new RouteTransitionCoordinator(transition, vi.fn());
    const first = coordinator.request('/workspace/a');
    expect(coordinator.request('/workspace/a')).toBe(first);
    await first;
    await coordinator.request('/workspace/a');
    expect(transition).toHaveBeenCalledTimes(1);
  });

  it('reports failure and permits retry without poisoning later transitions', async () => {
    const transition = vi.fn().mockRejectedValueOnce(new Error('save failed')).mockResolvedValue(undefined);
    const error = vi.fn();
    const coordinator = new RouteTransitionCoordinator(transition, error);
    await coordinator.request('/');
    expect(coordinator.getSnapshot()).toMatchObject({ status: 'error', path: '/' });
    await coordinator.request('/');
    await coordinator.request('/workspace/a');
    expect(error).toHaveBeenCalledTimes(1);
    expect(transition.mock.calls.map(call => call[0])).toEqual(['/', '/', '/workspace/a']);
    expect(coordinator.getSnapshot()).toEqual({ status: 'ready', path: '/workspace/a' });
  });

  it('publishes stable observable snapshots and stops notifying unsubscribed views', async () => {
    const coordinator = new RouteTransitionCoordinator(async () => {}, vi.fn());
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);
    const initial = coordinator.getSnapshot();
    expect(coordinator.getSnapshot()).toBe(initial);
    await coordinator.request('/');
    expect(listener).toHaveBeenCalledTimes(2);
    const ready = coordinator.getSnapshot();
    await coordinator.request('/');
    expect(coordinator.getSnapshot()).toBe(ready);
    unsubscribe();
    await coordinator.request('/workspace/a');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
