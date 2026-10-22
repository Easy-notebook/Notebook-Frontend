import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { downloadBlob } from '@Services/notebook/BrowserDownload';
import { StudyKnowledgeReport } from './StudyKnowledgeReport';

vi.mock('@Services/notebook/BrowserDownload', () => ({ downloadBlob: vi.fn() }));
const props = { notebookId: 'houses', workspace: 'workspace-a', revision: 4, busy: false };
const value = {
  frontend_notebook_id: 'houses',
  workspace: 'workspace-a',
  revision: 4,
  agent: 'NotebookWorkspace',
  report: '# Effective knowledge\n\n住房证据\n',
};
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('exports the exact server String only after an explicit read and download', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response(value));
  vi.stubGlobal('fetch', fetch);
  const view = render(<StudyKnowledgeReport {...props} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '生成可下载知识报告' }));
  await screen.findByRole('button', { name: '下载知识报告 Markdown' });
  expect(screen.getByLabelText('知识报告 Markdown').textContent).toBe(value.report);
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/knowledge-report');
  expect(downloadBlob).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '下载知识报告 Markdown' }));
  expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'knowledge-revision-4.md');
  view.rerender(<StudyKnowledgeReport {...props} revision={5} />);
  expect(screen.queryByRole('button', { name: '下载知识报告 Markdown' })).not.toBeInTheDocument();
});

it.each(['navigation', 'mutation'] as const)('discards late reports after %s', async (change) => {
  let finish!: (r: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  const view = render(<StudyKnowledgeReport {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '生成可下载知识报告' }));
  view.rerender(
    <StudyKnowledgeReport
      {...props}
      notebookId={change === 'navigation' ? 'other' : 'houses'}
      busy={change === 'mutation'}
    />
  );
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  view.rerender(<StudyKnowledgeReport {...props} />);
  await act(async () => {
    finish(response(value));
  });
  expect(screen.queryByRole('button', { name: '下载知识报告 Markdown' })).not.toBeInTheDocument();
  expect(downloadBlob).not.toHaveBeenCalled();
});

it('retries failed reads and rejects mismatched owner or revision', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValueOnce(response(value))
  );
  render(<StudyKnowledgeReport {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '生成可下载知识报告' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '生成可下载知识报告' }));
  await screen.findByRole('button', { name: '下载知识报告 Markdown' });
  for (const field of ['frontend_notebook_id', 'workspace', 'revision'] as const) {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      response({ ...value, [field]: field === 'revision' ? 5 : 'other' })
    );
    await expect(
      new NativeStudyClient('houses', request).knowledgeReport('workspace-a', 4)
    ).rejects.toThrow();
  }
});
