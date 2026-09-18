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
