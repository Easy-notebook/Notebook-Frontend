import { act, render, screen } from '@testing-library/react';
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
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('ignores an older render after the source changes', async () => {
    vi.useFakeTimers();
    const first = deferred<{ svg: string }>();
    const second = deferred<{ svg: string }>();
    vi.mocked(mermaid.render)
      .mockReturnValueOnce(first.promise as ReturnType<typeof mermaid.render>)
      .mockReturnValueOnce(second.promise as ReturnType<typeof mermaid.render>);

    const view = render(<MermaidPreview source="graph TD; A-->B" />);
    act(() => {
      vi.advanceTimersByTime(180);
    });
    view.rerender(<MermaidPreview source="graph TD; B-->C" />);
    act(() => {
      vi.advanceTimersByTime(180);
    });

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
