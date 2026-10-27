// utils/exportUtils.ts

// Type definitions for export utilities
import type { Cell, Task } from '@Store/models';

type ExportHandler = (cells: Cell[], tasks?: Task[]) => Promise<void>;

interface ExportType {
  title: string;
  description: string;
  handler: ExportHandler;
}

interface ExportHandlers {
  exportJson: () => Promise<void>;
  exportDocx: () => Promise<void>;
  exportPdf: () => Promise<void>;
  exportMarkdown: () => Promise<void>;
}

/** Capture one invocation before its exporter can yield for lazy module loading. */
function snapshotExport(exporter: ExportHandler): ExportHandler {
  return async (cells, tasks) => {
    const snapshot = structuredClone({ cells, tasks });
    await exporter(snapshot.cells, snapshot.tasks);
  };
}

export const exportTypes: Record<string, ExportType> = {
  json: {
    title: 'Export as JSON',
    description: 'Save notebook with all metadata as JSON file',
    handler: snapshotExport(async (cells, tasks) =>
      (await import('./exportToJson')).exportToJson(cells, tasks)
    ),
  },
  docx: {
    title: 'Export as DOCX',
    description: 'Export as Microsoft Word document',
    handler: snapshotExport(async (cells) => (await import('./exportToDocx')).exportToDocx(cells)),
  },
  pdf: {
    title: 'Export as PDF',
    description: 'Export as PDF document',
    handler: snapshotExport(async (cells) => (await import('./exportToPDF')).exportToPdf(cells)),
  },
  markdown: {
    title: 'Export as Markdown',
    description: 'Export as Markdown document',
    handler: snapshotExport(async (cells) =>
      (await import('./exportToMarkdown')).exportToMarkdown(cells)
    ),
  },
};

// 简化的导出处理器创建函数
export const createExportHandlers = (cells: Cell[], tasks?: Task[]): ExportHandlers => ({
  exportJson: () => exportTypes.json.handler(cells, tasks),
  exportDocx: () => exportTypes.docx.handler(cells),
  exportPdf: () => exportTypes.pdf.handler(cells),
  exportMarkdown: () => exportTypes.markdown.handler(cells),
});
