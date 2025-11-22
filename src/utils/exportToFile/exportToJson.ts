// utils/jsonExport.ts

// Type definitions for JSON export
import type { Cell, Task } from '@Store/models';

interface NotebookData {
  cells: Cell[];
  tasks?: Task[];
  version: string;
}

export const exportToJson = (cells: Cell[], tasks?: Task[]): void => {
  const notebookData: NotebookData = {
    cells,
    tasks,
    version: '1.0',
  };

  const dataStr: string = JSON.stringify(notebookData, null, 2);
  const blob: Blob = new Blob([dataStr], { type: 'application/json' });
  const url: string = URL.createObjectURL(blob);

  const a: HTMLAnchorElement = document.createElement('a');
  a.href = url;
  a.download = 'notebook.json';
  a.click();

  URL.revokeObjectURL(url);
};
