import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models';
const pdf = vi.hoisted(() => ({
  vfs: {} as Record<string, string> | undefined,
  fonts: {} as Record<string, unknown> | undefined,
  createPdf: vi.fn(),
  download: vi.fn(),
}));
vi.mock('pdfmake/build/pdfmake', () => ({ default: pdf }));
import { exportToPdf } from './exportToPDF';
beforeEach(() => {
  vi.clearAllMocks();
  pdf.vfs = {};
  pdf.fonts = {};
  pdf.createPdf.mockReturnValue({ download: pdf.download });
});
afterEach(() => vi.unstubAllGlobals());
const definition = () => pdf.createPdf.mock.calls[0][0];
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('');
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .filter(([key]) => ['text', 'stack', 'table', 'body'].includes(key))
    .map(([, child]) => textOf(child))
    .join('');
};
it('retains hybrid prose, fenced code and output in document order', async () => {
  await exportToPdf([
    {
      id: 'hybrid',
      type: 'hybrid',
      content: 'Before\n\n```python\nprint(7)\n```\n\nAfter',
      outputs: [{ type: 'text', content: 'result 7' }],
    },
  ]);
  const text = textOf(definition().content);
  expect(text).toContain('Before');
  expect(text).toContain('print(7)');
  expect(text.indexOf('Before')).toBeLessThan(text.indexOf('print(7)'));
  expect(text.indexOf('print(7)')).toBeLessThan(text.indexOf('After'));
  expect(text.indexOf('After')).toBeLessThan(text.indexOf('result 7'));
  expect(text.match(/result 7/g)).toHaveLength(1);
});
it('retains output for empty code and hybrid sources, including numeric zero', async () => {
  await exportToPdf([
    { id: 'code', type: 'code', content: '', outputs: [{ type: 'text', content: 0 }] },
    { id: 'hybrid', type: 'hybrid', content: '', outputs: [{ type: 'error', content: 'failure' }] },
  ]);
  expect(definition().content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: '0', style: 'output' }),
      expect.objectContaining({ text: 'failure', style: 'error' }),
    ])
  );
  expect(pdf.download).toHaveBeenCalledExactlyOnceWith('notebook.pdf');
});
it('uses the accepted source and output while font loading is pending', async () => {
  pdf.vfs = undefined;
  pdf.fonts = undefined;
  let release!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    )
  );
  const cells: Cell[] = [
    {
      id: 'code',
      type: 'code',
      content: 'accepted',
      outputs: [{ type: 'text', content: 'accepted output' }],
    },
  ];
  const pending = exportToPdf(cells);
  cells[0].content = 'late edit';
  cells[0].outputs![0].content = 'late output';
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
  await pending;
  const text = textOf(definition().content);
  expect(text).toContain('accepted');
  expect(text).toContain('accepted output');
  expect(text).not.toContain('late');
});
