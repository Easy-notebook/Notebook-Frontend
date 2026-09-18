import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ExportToFile from './ExportToFile';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it('keeps pending exports visible and allows retry after failure', async () => {
  let reject!: (reason: Error) => void;
  const exportPdf = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  const view = render(
    <ExportToFile
      onExportPdf={exportPdf}
      onExportDocx={vi.fn()}
      onExportJson={vi.fn()}
      onExportMarkdown={vi.fn()}
    />
  );
  fireEvent.click(screen.getByTitle('fileOperations.export'));
  fireEvent.click(screen.getByText('exportOptions.exportToPDF'));
  expect(screen.getByRole('status').textContent).toBe('Preparing export…');
  expect(view.container.querySelector('fieldset')?.disabled).toBe(true);
  await act(async () => {
    reject(new Error('Download unavailable'));
  });
  expect(screen.getByRole('alert').textContent).toBe('Download unavailable');
  expect(view.container.querySelector('fieldset')?.disabled).toBe(false);
  exportPdf.mockResolvedValueOnce();
  fireEvent.click(screen.getByText('exportOptions.exportToPDF'));
  await act(async () => {});
  expect(screen.queryByText('exportOptions.exportToPDF')).toBeNull();
});
