import { expect, it, vi } from 'vitest';
import { MathRenderService } from './MathRenderService';

it('loads once for concurrent formulas and skips cancelled work before parsing', async () => {
  const renderMath = vi.fn((source: string) => source);
  let resolve!: (renderer: { renderMath: typeof renderMath }) => void;
  const load = vi.fn(
    () =>
      new Promise<{ renderMath: typeof renderMath }>((done) => {
        resolve = done;
      })
  );
  const service = new MathRenderService(load);
  const controller = new AbortController();
  const obsolete = service.render('old', false, controller.signal);
  const latest = service.render('new', true);
  controller.abort();
  resolve({ renderMath });
  expect(await obsolete).toBeUndefined();
  expect(await latest).toBe('new');
  expect(load).toHaveBeenCalledTimes(1);
  expect(renderMath).toHaveBeenCalledExactlyOnceWith('new', true);
  await service.render('again', false);
  expect(load).toHaveBeenCalledTimes(1);
});

it('retries a failed load and does not reload for a formula failure', async () => {
  const renderMath = vi.fn(() => 'rendered');
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ renderMath });
  const service = new MathRenderService(load);
  await expect(service.render('x', false)).rejects.toThrow('offline');
  expect(await service.render('x', false)).toBe('rendered');
  renderMath.mockImplementationOnce(() => {
    throw new Error('formula');
  });
  await expect(service.render('bad', false)).rejects.toThrow('formula');
  expect(await service.render('fixed', false)).toBe('rendered');
  expect(load).toHaveBeenCalledTimes(2);
});

it('does not load an engine for an already cancelled request', async () => {
  const load = vi.fn();
  const service = new MathRenderService(load);
  const controller = new AbortController();
  controller.abort();
  expect(await service.render('x', false, controller.signal)).toBeUndefined();
  expect(load).not.toHaveBeenCalled();
});
