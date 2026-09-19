import { act, cleanup, render, screen } from '@testing-library/react';
import { lazy } from 'react';
import { expect, it, vi } from 'vitest';
import { CSVPreviewWrapper, HighlightedSource, PreviewLoadBoundary } from './DeferredViewers';

const loaded = vi.hoisted(() => vi.fn());
vi.mock('./code/CodeDisplay', () => {
  loaded('code');
  return { default: () => null };
});
vi.mock('./code/HighlightedSource', () => {
  loaded('highlight');
  return { default: ({ children }: { children: string }) => <pre>{children}</pre> };
});
vi.mock('./data-table/DataTable', () => {
  loaded('table');
  return { default: () => <div>Spreadsheet ready</div> };
});

it('contains a failed module load and resets the boundary when the selected file changes', async () => {
  cleanup();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const Broken = lazy(() => Promise.reject(new Error('Network unavailable')));
  try {
    const view = render(
      <PreviewLoadBoundary key="failed-file">
        <Broken />
      </PreviewLoadBoundary>
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.getByRole('alert').textContent).toContain('Preview could not be loaded');
    view.rerender(
      <PreviewLoadBoundary key="other-file">
        <div>Other file</div>
      </PreviewLoadBoundary>
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Other file')).toBeDefined();
  } finally {
    consoleError.mockRestore();
  }
});
vi.mock('./doc/DocDisplay', () => {
  loaded('doc');
  return { default: () => null };
});
vi.mock('./web/ReactLiveSandbox', () => {
  loaded('sandbox');
  return { default: () => null };
});

it('loads only the requested preview and presents its loading lifecycle', async () => {
  expect(loaded).not.toHaveBeenCalled();
  render(
    <PreviewLoadBoundary>
      <CSVPreviewWrapper />
    </PreviewLoadBoundary>
  );
  expect(screen.getByRole('status').textContent).toBe('Loading preview…');
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(screen.getByText('Spreadsheet ready')).toBeDefined();
  expect(loaded.mock.calls).toEqual([['table']]);
});

it('loads HTML highlighting only when source preview is requested', async () => {
  cleanup();
  loaded.mockClear();
  render(<PreviewLoadBoundary><HighlightedSource isDark={false} language="html">{'<p>Source</p>'}</HighlightedSource></PreviewLoadBoundary>);
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(screen.getByText('<p>Source</p>')).toBeDefined();
  expect(loaded.mock.calls).toEqual([['highlight']]);
});
