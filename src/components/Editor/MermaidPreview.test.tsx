import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
const theme = vi.hoisted(() => ({ resolvedTheme: 'light' as 'light' | 'dark' }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => theme }));

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
  it('releases the derived preview when source is cleared', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' } as any);
    const view = render(<MermaidPreview source="graph TD; A-->B" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
      await vi.dynamicImportSettled();
    });
    expect(view.container.querySelector('svg')).not.toBeNull();
    view.rerender(<MermaidPreview source="  " />);
    expect(view.container.querySelector('svg')).toBeNull();
    view.rerender(<MermaidPreview source="graph TD; A-->B" />);
    expect(view.container.querySelector('svg')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('svg')).not.toBeNull();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
    theme.resolvedTheme = 'light';
  });

  it('preserves measured diagram height while an edited source is being rendered', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    let resize!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    vi.useFakeTimers();
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 360 } as DOMRect);
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' } as any);
    try {
      const view = render(<MermaidPreview source="graph TD; A-->B" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180);
        await vi.dynamicImportSettled();
      });
      expect(view.container.querySelector('svg')).not.toBeNull();
      measure.mockReturnValue({ height: 520 } as DOMRect);
      act(() => resize());
      // Hidden ancestors must not erase the last usable size.
      measure.mockReturnValue({ height: 0 } as DOMRect);
      act(() => resize());
      view.rerender(<MermaidPreview source="graph TD; A-->C" />);
      expect((view.container.firstElementChild as HTMLElement).style.height).toBe('520px');
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      measure.mockRestore();
    }
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
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ height: 240 } as DOMRect);
    visibility(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(view.container.querySelector('svg')).toBeNull();
    expect((view.container.firstElementChild as HTMLElement).style.height).toBe('240px');
    visibility(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('svg')).not.toBeNull();
    target.setAttribute('tabindex', '0');
    (target as HTMLElement).focus();
    visibility(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(view.container.querySelector('svg')).not.toBeNull();
    (target as HTMLElement).blur();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(view.container.querySelector('svg')).toBeNull();
    visibility(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.selectNode(target);
    selection.removeAllRanges();
    selection.addRange(range);
    visibility(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(view.container.querySelector('svg')).not.toBeNull();
    selection.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(view.container.querySelector('svg')).toBeNull();
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
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve({ svg: '<svg id="old"></svg>' });
    });
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Mermaid diagram')).toBeNull();

    await act(async () => {
      second.resolve({ svg: '<svg id="new"></svg>' });
    });
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#new')).not.toBeNull();
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#new')).not.toBeNull();
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#old')).toBeNull();
  });
  it('rerenders unchanged source for a new theme without showing the stale diagram', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' } as any);
    const view = render(<MermaidPreview source="graph TD; A-->B" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(screen.getByLabelText('Mermaid diagram')).not.toBeNull();
    theme.resolvedTheme = 'dark';
    view.rerender(<MermaidPreview source="graph TD; A-->B" />);
    expect(screen.queryByLabelText('Mermaid diagram')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark', securityLevel: 'strict' })
    );
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    view.rerender(<MermaidPreview source="" />);
    expect(screen.queryByLabelText('Mermaid diagram')).toBeNull();
    expect(screen.getByText('Enter Mermaid source to preview the diagram.')).not.toBeNull();
  });
  it('offers explicit retry after a rendering failure', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    vi.mocked(mermaid.render)
      .mockRejectedValueOnce(new Error('Invalid diagram'))
      .mockResolvedValue({ svg: '<svg></svg>' } as any);
    render(<MermaidPreview source="graph TD; A-->B" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(screen.getByText('Invalid diagram')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry diagram' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(screen.getByLabelText('Mermaid diagram')).not.toBeNull();
  });
  it('recovers immediately from edited invalid source without requiring manual retry', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    vi.mocked(mermaid.render)
      .mockRejectedValueOnce(new Error('Invalid source'))
      .mockResolvedValueOnce({ svg: '<svg id="repaired"></svg>' } as any);
    const view = render(<MermaidPreview source="invalid diagram" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(screen.getByText('Invalid source')).not.toBeNull();
    view.rerender(<MermaidPreview source="graph TD; A-->B" />);
    expect(screen.queryByText('Invalid source')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(mermaid.render).toHaveBeenLastCalledWith(expect.any(String), 'graph TD; A-->B');
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#repaired')).not.toBeNull();
  });
  it('ignores failure from a superseded render and continues the queued corrected source', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    let reject!: (reason: Error) => void;
    const old = new Promise<never>((_, fail) => {
      reject = fail;
    });
    vi.mocked(mermaid.render)
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ svg: '<svg id="current"></svg>' } as any);
    const view = render(<MermaidPreview source="invalid pending diagram" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    view.rerender(<MermaidPreview source="graph TD; A-->B" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    await act(async () => {
      reject(new Error('Obsolete failure'));
    });
    expect(screen.queryByText('Obsolete failure')).toBeNull();
    expect(screen.getByLabelText('Mermaid diagram').querySelector('#current')).not.toBeNull();
    expect(mermaid.render).toHaveBeenCalledTimes(2);
  });
  it('removes a queued preview when its component unmounts', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    const pending = deferred<{ svg: string }>();
    vi.mocked(mermaid.render).mockReturnValueOnce(
      pending.promise as ReturnType<typeof mermaid.render>
    );
    const first = render(<MermaidPreview source="graph TD; A-->B" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    const second = render(<MermaidPreview source="graph TD; C-->D" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    second.unmount();
    await act(async () => {
      pending.resolve({ svg: '<svg></svg>' });
    });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    first.unmount();
  });
});
