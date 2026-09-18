import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

import mermaid from 'mermaid';
import { MermaidPreview } from './MermaidPreview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('MermaidPreview', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('defers offscreen work, coalesces edits and reuses the completed visible preview', async () => {
    vi.useFakeTimers();
    let report!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          report = callback;
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect;
      }
    );
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' } as any);
    const view = render(<MermaidPreview source="graph TD; A-->B" />);
    const target = view.container.firstElementChild!;
    const visibility = (isIntersecting: boolean) =>
      act(() => {
        report(
          [{ target, isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });
    view.rerender(<MermaidPreview source="graph TD; B-->C" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mermaid.render).not.toHaveBeenCalled();
    visibility(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
      await vi.dynamicImportSettled();
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(mermaid.render).toHaveBeenLastCalledWith(expect.any(String), 'graph TD; B-->C');
    visibility(false);
    visibility(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores an older render after the source changes', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    const first = deferred<{ svg: string }>();
    const second = deferred<{ svg: string }>();
    vi.mocked(mermaid.render)
      .mockReturnValueOnce(first.promise as ReturnType<typeof mermaid.render>)
      .mockReturnValueOnce(second.promise as ReturnType<typeof mermaid.render>);

    const view = render(<MermaidPreview source="graph TD; A-->B" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
      await vi.dynamicImportSettled();
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    view.rerender(<MermaidPreview source="graph TD; B-->C" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(mermaid.render).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ svg: '<svg id="new"></svg>' });
    });
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#new')).not.toBeNull();
    await act(async () => {
      first.resolve({ svg: '<svg id="old"></svg>' });
    });
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#new')).not.toBeNull();
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#old')).toBeNull();
  });
});
