// utils/exportUtils.ts
import { exportToJson } from './exportToJson';
import { exportToDocx } from './exportToDocx';
import { exportToPdf } from './exportToPDF';
import { exportToMarkdown } from './exportToMarkdown';

// Type definitions for export utilities
interface Cell {
  id: string;
  type: 'markdown' | 'code' | 'hybrid';
  content: string;
  outputs?: any[];
  [key: string]: any;
}

interface Task {
  id: string;
  title: string;
  phases: any[];
  [key: string]: any;
}

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

export const exportTypes: Record<string, ExportType> = {
  json: {
    title: "Export as JSON",
    description: "Save notebook with all metadata as JSON file",
    handler: (cells: Cell[], tasks?: Task[]) => exportToJson(cells, tasks)
  },
  docx: {
    title: "Export as DOCX",
    description: "Export as Microsoft Word document",
    handler: (cells: Cell[]) => exportToDocx(cells)
  },
  pdf: {
    title: "Export as PDF",
    description: "Export as PDF document",
    handler: (cells: Cell[]) => exportToPdf(cells)
  },
  markdown: {
    title: "Export as Markdown",
    description: "Export as Markdown document",
    handler: (cells: Cell[]) => exportToMarkdown(cells)
  }
};

// 简化的导出处理器创建函数
export const createExportHandlers = (cells: Cell[], tasks?: Task[]): ExportHandlers => ({
  exportJson: () => exportTypes.json.handler(cells, tasks),
  exportDocx: () => exportTypes.docx.handler(cells),
  exportPdf: () => exportTypes.pdf.handler(cells),
  exportMarkdown: () => exportTypes.markdown.handler(cells)
});