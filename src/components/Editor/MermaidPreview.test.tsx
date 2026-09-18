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
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
    theme.resolvedTheme = 'light';
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
