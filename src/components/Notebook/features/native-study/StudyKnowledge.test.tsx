import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeStudyClient } from '@Services/native-study/NativeStudyClient';
import { StudyKnowledge } from './StudyKnowledge';

const props = { notebookId: 'houses', workspace: 'workspace-a', revision: 4, busy: false };
function snapshot() {
  return {
    frontend_notebook_id: 'houses',
    workspace: 'workspace-a',
    revision: 4,
    agent: 'NotebookWorkspace',
    context: {
      claim_policy: 'Candidates remain unverified',
      learned: {
        knowledge: {
          practice: [
            {
              id: 'fact-1',
              text: 'Measured housing neighbor',
              status: 'supported',
              source: {
                agent: 'NotebookWorkspace',
                invocation: 'measured-houses',
                call_id: 'step-1',
              },
              atom: { relation: 'housing_neighbor', terms: [] },
            },
          ],
        },
      },
    },
  };
}
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

it('reads only on request, retains full native evidence and clears it on revision change', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response(snapshot()));
  vi.stubGlobal('fetch', fetch);
  const view = render(<StudyKnowledge {...props} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '查看研究知识' }));
  await screen.findByText('已支持 · Measured housing neighbor');
  expect(screen.getByText(/记录者：NotebookWorkspace.*measured-houses/)).toBeInTheDocument();
  expect(JSON.parse(screen.getByLabelText('完整知识快照 JSON').textContent!)).toEqual(snapshot());
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/knowledge');
  view.rerender(<StudyKnowledge {...props} revision={5} />);
  expect(screen.queryByText('已支持 · Measured housing neighbor')).not.toBeInTheDocument();
});

it('ignores a late reply after leaving and returning to the same notebook', async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  const view = render(<StudyKnowledge {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '查看研究知识' }));
  const signal = (fetch.mock.calls[0][1] as RequestInit).signal!;
  view.rerender(<StudyKnowledge {...props} notebookId="other" />);
  expect(signal.aborted).toBe(true);
  view.rerender(<StudyKnowledge {...props} />);
  await act(async () => {
    finish(response(snapshot()));
  });
  expect(screen.queryByLabelText('完整知识快照 JSON')).not.toBeInTheDocument();
});

it('cancels an in-flight observation when a study command starts and permits a fresh read', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          })
      )
      .mockImplementationOnce(async () => response(snapshot()))
  );
  const view = render(<StudyKnowledge {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '查看研究知识' }));
  view.rerender(<StudyKnowledge {...props} busy />);
  await act(async () => {
    finish(response(snapshot()));
  });
  expect(screen.queryByLabelText('完整知识快照 JSON')).not.toBeInTheDocument();
  view.rerender(<StudyKnowledge {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '查看研究知识' }));
  await screen.findByLabelText('完整知识快照 JSON');
});

it('surfaces failed reads and retries without a mutation command', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('Disconnected'))
    .mockResolvedValueOnce(response(snapshot()));
  vi.stubGlobal('fetch', fetch);
  render(<StudyKnowledge {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '查看研究知识' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '查看研究知识' }));
  await screen.findByLabelText('完整知识快照 JSON');
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it('rejects wrong notebook, workspace, revision and non-active native status', async () => {
  for (const field of ['frontend_notebook_id', 'workspace', 'revision'] as const) {
    const value = { ...snapshot(), [field]: field === 'revision' ? 5 : 'different' };
    const request = vi.fn<typeof globalThis.fetch>(async () => response(value));
    await expect(
      new NativeStudyClient('houses', request).knowledge('workspace-a', 4)
    ).rejects.toThrow();
  }
  const value = snapshot();
  value.context.learned.knowledge.practice[0].status = 'stale';
  await expect(
    new NativeStudyClient(
      'houses',
      vi.fn<typeof globalThis.fetch>(async () => response(value))
    ).knowledge('workspace-a', 4)
  ).rejects.toThrow();
});
