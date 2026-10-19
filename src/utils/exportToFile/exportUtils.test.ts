import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cell, Task } from '@Store/models';

const mocks = vi.hoisted(() => ({
  loaded: vi.fn(),
  pdf: vi.fn(),
  docx: vi.fn(),
  json: vi.fn(),
  markdown: vi.fn(),
}));
vi.mock('./exportToPDF', () => {
  mocks.loaded('pdf');
  return { exportToPdf: mocks.pdf };
});
vi.mock('./exportToDocx', () => {
  mocks.loaded('docx');
  return { exportToDocx: mocks.docx };
});
vi.mock('./exportToJson', () => ({ exportToJson: mocks.json }));
vi.mock('./exportToMarkdown', () => ({ exportToMarkdown: mocks.markdown }));
import { exportTypes, createExportHandlers } from './exportUtils';

beforeEach(() => vi.clearAllMocks());

describe('on-demand export modules', () => {
  it('does not load exporters until selected and forwards the captured snapshot', async () => {
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

it.each(['json', 'docx', 'pdf', 'markdown'] as const)(
  '%s captures nested data before lazy dispatch',
  async (format) => {
    const cells: Cell[] = [
      {
        id: 'code',
        type: 'code',
        content: 'accepted',
        outputs: [{ type: 'text', content: 'accepted output' }],
        metadata: { label: 'accepted label' },
      },
    ];
    const tasks: Task[] = [{ id: 'task', title: 'accepted task', phases: [] }];
    const pending = exportTypes[format].handler(cells, tasks);
    cells[0].content = 'late';
    cells[0].outputs![0].content = 'late';
    cells[0].metadata!.label = 'late';
    tasks[0].title = 'late';
    await pending;
    const accepted = mocks[format].mock.calls[0][0];
    expect(accepted).not.toBe(cells);
    expect(accepted[0]).toMatchObject({
      content: 'accepted',
      outputs: [{ content: 'accepted output' }],
      metadata: { label: 'accepted label' },
    });
    if (format === 'json')
      expect(mocks.json.mock.calls[0][1]).toEqual([
        { id: 'task', title: 'accepted task', phases: [] },
      ]);
  }
);
it('captures fresh data on each invocation rather than when handlers are constructed', async () => {
  const cells: Cell[] = [{ id: 'cell', type: 'markdown', content: 'before' }];
  const handlers = createExportHandlers(cells);
  cells[0].content = 'first';
  await handlers.exportMarkdown();
  cells[0].content = 'second';
  await handlers.exportMarkdown();
  expect(mocks.markdown.mock.calls.map(([snapshot]) => snapshot[0].content)).toEqual([
    'first',
    'second',
  ]);
});
it('rejects an uncloneable snapshot without invoking its exporter', async () => {
  const cells: Cell[] = [
    { id: 'cell', type: 'markdown', content: 'text', metadata: { callback: () => {} } },
  ];
  await expect(createExportHandlers(cells).exportJson()).rejects.toThrow();
  expect(mocks.json).not.toHaveBeenCalled();
});
