import { describe, expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models';

const mocks = vi.hoisted(() => ({ loaded: vi.fn(), pdf: vi.fn(), docx: vi.fn() }));
vi.mock('./exportToPDF', () => {
  mocks.loaded('pdf');
  return { exportToPdf: mocks.pdf };
});
vi.mock('./exportToDocx', () => {
  mocks.loaded('docx');
  return { exportToDocx: mocks.docx };
});
import { createExportHandlers } from './exportUtils';

describe('on-demand export modules', () => {
  it('does not load exporters until selected and forwards the original snapshot', async () => {
    const cells: Cell[] = [];
    const handlers = createExportHandlers(cells);
    expect(mocks.loaded).not.toHaveBeenCalled();
    await handlers.exportPdf();
    expect(mocks.loaded.mock.calls).toEqual([['pdf']]);
    expect(mocks.pdf).toHaveBeenCalledWith(cells);
    await handlers.exportDocx();
    expect(mocks.docx).toHaveBeenCalledWith(cells);
  });
  it('propagates export failures to the caller', async () => {
    mocks.pdf.mockRejectedValueOnce(new Error('export failed'));
    await expect(createExportHandlers([]).exportPdf()).rejects.toThrow('export failed');
  });
});
