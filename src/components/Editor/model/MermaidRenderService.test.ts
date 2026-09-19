import { describe, expect, it, vi } from 'vitest';
import { MermaidRenderService } from './MermaidRenderService';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const request = (
  id: string,
  controller = new AbortController(),
  theme: 'light' | 'dark' = 'light'
) => ({ id, source: id, theme, signal: controller.signal });

describe('Mermaid render scheduling', () => {
  it('does not load Mermaid for a request already cancelled before enqueueing', async () => {
    const load = vi.fn();
    const service = new MermaidRenderService(load);
    const controller = new AbortController();
    controller.abort();
    await expect(service.render(request('cancelled', controller))).resolves.toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('consumes a late failure from a cancelled running diagram and continues the queue', async () => {
    let rejectRender!: (reason: Error) => void;
    const started = deferred<void>();
    const renderer = {
      initialize: vi.fn(),
      render: vi.fn().mockImplementationOnce(() => {
        started.resolve();
        return new Promise((_, reject) => { rejectRender = reject; });
      }).mockResolvedValue({ svg: 'next' }),
    };
    const service = new MermaidRenderService(async () => renderer);
    const controller = new AbortController();
    const obsolete = service.render(request('obsolete', controller));
    await started.promise;
    const next = service.render(request('next', new AbortController(), 'dark'));
    controller.abort();
    await expect(obsolete).resolves.toBeUndefined();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    rejectRender(new Error('obsolete parse failure'));
    await expect(next).resolves.toEqual({ svg: 'next' });
    expect(renderer.render.mock.calls.map(call => call[0])).toEqual(['obsolete', 'next']);
    expect(renderer.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
  it('retries configuration after initialization throws', async () => {
    const renderer = {
      initialize: vi.fn().mockImplementationOnce(() => {
        throw new Error('config');
      }),
      render: vi.fn().mockResolvedValue({ svg: 'ok' }),
    };
    const service = new MermaidRenderService(async () => renderer);
    await expect(service.render(request('bad'))).rejects.toThrow('config');
    await expect(service.render(request('retry'))).resolves.toEqual({ svg: 'ok' });
    expect(renderer.initialize).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenCalledExactlyOnceWith('retry', 'retry');
  });
  it('initializes once per theme transition rather than once per diagram', async () => {
    const renderer = { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: 'ok' }) };
    const service = new MermaidRenderService(async () => renderer);
    await Promise.all(['a', 'b', 'c'].map((id) => service.render(request(id))));
    expect(renderer.initialize).toHaveBeenCalledTimes(1);
    await service.render(request('dark', new AbortController(), 'dark'));
    await service.render(request('light'));
    expect(renderer.initialize.mock.calls.map((call) => call[0].theme)).toEqual([
      'default',
      'dark',
      'default',
    ]);
    expect(renderer.render).toHaveBeenCalledTimes(5);
  });
  it('removes obsolete queued edits and serializes theme configuration with rendering', async () => {
    const first = deferred<{ svg: string }>();
    const started = deferred<void>();
    const renderer = {
      initialize: vi.fn(),
      render: vi
        .fn()
        .mockImplementationOnce(() => {
          started.resolve();
          return first.promise;
        })
        .mockResolvedValue({ svg: 'latest' }),
    };
    const service = new MermaidRenderService(async () => renderer);
    const runningController = new AbortController();
    const running = service.render(request('running', runningController));
    await started.promise;
    expect(renderer.render).toHaveBeenCalledTimes(1);
    const cancelled: Promise<unknown>[] = [];
    for (let index = 0; index < 1000; index++) {
      const controller = new AbortController();
      cancelled.push(service.render(request(`stale-${index}`, controller)));
      controller.abort();
    }
    const latest = service.render(request('latest', new AbortController(), 'dark'));
    runningController.abort();
    expect(await running).toBeUndefined();
    expect((await Promise.all(cancelled)).every((value) => value === undefined)).toBe(true);
    expect(renderer.initialize).toHaveBeenCalledTimes(1);
    first.resolve({ svg: 'obsolete' });
    expect(await latest).toEqual({ svg: 'latest' });
    expect(renderer.render.mock.calls.map((call) => call[0])).toEqual(['running', 'latest']);
    expect(renderer.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark', securityLevel: 'strict' })
    );
  });
  it('skips a cancelled job while the renderer is still loading', async () => {
    const renderer = { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: 'ok' }) };
    const loading = deferred<typeof renderer>();
    const service = new MermaidRenderService(() => loading.promise);
    const controller = new AbortController();
    const old = service.render(request('old', controller));
    controller.abort();
    expect(await old).toBeUndefined();
    const next = service.render(request('next'));
    loading.resolve(renderer);
    await next;
    expect(renderer.render).toHaveBeenCalledExactlyOnceWith('next', 'next');
  });
  it('recovers from load and render failures without poisoning the queue', async () => {
    const renderer = {
      initialize: vi.fn(),
      render: vi.fn().mockRejectedValueOnce(new Error('parse')).mockResolvedValue({ svg: 'ok' }),
    };
    const load = vi.fn().mockRejectedValueOnce(new Error('load')).mockResolvedValue(renderer);
    const service = new MermaidRenderService(load);
    await expect(service.render(request('load-failure'))).rejects.toThrow('load');
    const bad = service.render(request('render-failure'));
    const good = service.render(request('good'));
    await expect(bad).rejects.toThrow('parse');
    await expect(good).resolves.toEqual({ svg: 'ok' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
