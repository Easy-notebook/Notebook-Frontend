import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MathPreview } from './MathPreview';
import { mathRenderService } from './model/MathRenderService';
import { PreviewEngineLoadError } from './model/PreviewEngineLoadError';

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('parses only admitted formulas in a long document and retains completed previews', async () => {
  let report!: IntersectionObserverCallback;
  const targets: Element[] = [];
  const disconnect = vi.fn();
  const observe = vi.fn((element: Element) => targets.push(element));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        report = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    }
  );
  const renderMath = vi.spyOn(mathRenderService, 'render').mockResolvedValue('<b>rendered</b>');
  const view = render(
    <>
      {Array.from({ length: 100 }, (_, index) => (
        <MathPreview key={index} source={`x_${index}`} displayMode={false} />
      ))}
    </>
  );
  expect(observe).toHaveBeenCalledTimes(100);
  expect(renderMath).not.toHaveBeenCalled();
  await act(async () => {
    report(
      targets
        .slice(0, 10)
        .map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      {} as IntersectionObserver
    );
  });
  expect(renderMath).toHaveBeenCalledTimes(10);
  expect(view.container.querySelectorAll('b')).toHaveLength(10);
  expect(view.container.querySelectorAll('code')).toHaveLength(90);
  await act(async () => {
    report(
      targets
        .slice(0, 10)
        .map((target) => ({ target, isIntersecting: false }) as IntersectionObserverEntry),
      {} as IntersectionObserver
    );
  });
  expect(view.container.querySelectorAll('b')).toHaveLength(10);
  expect(renderMath).toHaveBeenCalledTimes(10);
  view.unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it('retains source, rejects stale results, and cancels ownership on unmount', async () => {
  const pending: Array<{ resolve: (html: string) => void; signal?: AbortSignal }> = [];
  vi.spyOn(mathRenderService, 'render').mockImplementation(
    (_source, _display, signal) => new Promise((resolve) => pending.push({ resolve, signal }))
  );
  const view = render(<MathPreview source="old" displayMode={false} />);
  expect(screen.getByText('old').tagName).toBe('CODE');
  view.rerender(<MathPreview source="new" displayMode />);
  expect(pending[0].signal?.aborted).toBe(true);
  await act(async () => {
    pending[0].resolve('<b>obsolete</b>');
  });
  expect(screen.queryByText('obsolete')).toBeNull();
  expect(screen.getByText('new')).toBeTruthy();
  await act(async () => {
    pending[1].resolve('<b>latest</b>');
  });
  expect(screen.getByText('latest')).toBeTruthy();
  view.unmount();
  expect(pending[1].signal?.aborted).toBe(true);
});

it('shows source and supports explicit retry after rendering fails', async () => {
  const renderMath = vi
    .spyOn(mathRenderService, 'render')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce('<b>ready</b>');
  render(<MathPreview source="x^2" displayMode={false} />);
  await screen.findByRole('button', { name: 'Retry formula' });
  expect(screen.getByText('x^2').tagName).toBe('CODE');
  fireEvent.click(screen.getByRole('button', { name: 'Retry formula' }));
  await screen.findByText('ready');
  expect(renderMath).toHaveBeenCalledTimes(2);
});

it('preserves source and requests a safe reload for a cached module-load failure', async () => {
  vi.spyOn(mathRenderService, 'render').mockRejectedValue(
    new PreviewEngineLoadError('Formula engine', new Error('offline'))
  );
  render(<MathPreview source="x^2" displayMode={false} />);
  const status = await screen.findByRole('status');
  expect(status.textContent).toContain('Save your work, then reload');
  expect(screen.getByText('x^2').tagName).toBe('CODE');
  expect(screen.queryByRole('button', { name: 'Retry formula' })).toBeNull();
});

it('does not request an engine for empty source', () => {
  const renderMath = vi.spyOn(mathRenderService, 'render');
  render(<MathPreview source="" displayMode />);
  expect(renderMath).not.toHaveBeenCalled();
});
