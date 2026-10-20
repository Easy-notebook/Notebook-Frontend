import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HousingStudyPanel } from './HousingStudyPanel';
vi.mock('@Services/native-study/publishStudy', () => ({ publishStudy: vi.fn() }));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: 'a', addCell: vi.fn() }) },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
function savedView(owner: string, csv: string) {
  return {
    frontend_notebook_id: owner,
    document: { id: `native-${owner}`, revision: 1, notebook: { status: 'Open' } },
    model_enabled: false,
    study: {
      input: {
        revision: 1,
        configuration: {
          kind: 'mining',
          csv,
          parameters: { columns: ['area', 'rooms'], clusters: 3 },
        },
      },
      current: false,
      result: null,
      comparison: null,
      practice: null,
      sample_evidence: null,
    },
  };
}
it('requires saving a changed draft before running against the stored input', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(savedView('a', 'area,rooms\n40,2'))))
  );
  render(<HousingStudyPanel notebookId="a" />);
  const input = screen.getByLabelText('参考 CSV 内容');
  await waitFor(() => expect(input).toHaveValue('area,rooms\n40,2'));
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeEnabled();
  fireEvent.change(input, { target: { value: 'area,rooms\n50,2' } });
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeDisabled();
  expect(screen.getByText(/当前输入尚未保存/)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'area,rooms\n40,2' } });
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeEnabled();
});
it('loads another notebook input even when both saved revisions have the same number', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(savedView('a', 'area,rooms\n40,2'))))
      .mockResolvedValueOnce(new Response(JSON.stringify(savedView('b', 'area,rooms\n90,4'))))
  );
  const view = render(<HousingStudyPanel notebookId="a" />);
  await waitFor(() =>
    expect(screen.getByLabelText('参考 CSV 内容')).toHaveValue('area,rooms\n40,2')
  );
  view.rerender(<HousingStudyPanel notebookId="b" />);
  await waitFor(() =>
    expect(screen.getByLabelText('参考 CSV 内容')).toHaveValue('area,rooms\n90,4')
  );
});
it('admits only one initial read under StrictMode and enables the actual study form', async () => {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          frontend_notebook_id: 'a',
          document: { id: 'native-a', revision: 0, notebook: { status: 'Open' } },
          model_enabled: false,
          study: {
            input: null,
            current: false,
            result: null,
            comparison: null,
            practice: null,
            sample_evidence: null,
          },
        }),
        { status: 200 }
      )
  );
  vi.stubGlobal('fetch', request);
  render(
    <StrictMode>
      <HousingStudyPanel notebookId="a" />
    </StrictMode>
  );
  await screen.findByText(/研究已就绪/);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('参考 CSV 内容')).toBeEnabled();
  expect(screen.getByRole('button', { name: '执行房屋分群' })).toBeDisabled();
});
