import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
