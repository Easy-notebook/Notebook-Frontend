// components/Notebook/useImportNotebook.js
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import useStore from '@Store/notebookStore';
import type { Cell, CellType, OutputItem } from '@Store/models';
import { useToast } from '@/components/UI/Toast';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';
import { parseMarkdownContent } from '@Editor/utils/markdownParser';
import { fileLog } from '@Utils/logger';

// Type definitions for imported notebook formats
interface CustomNotebookData {
  cells: Cell[];
  metadata?: Record<string, unknown>;
}

interface JupyterCell {
  cell_type: string;
  source: string | string[];
  outputs?: Array<{
    output_type: string;
    data?: Record<string, unknown>;
    execution_count?: number | null;
  }>;
  metadata?: Record<string, unknown>;
}

interface JupyterNotebookData {
  cells: JupyterCell[];
  metadata?: {
    name?: string;
    [key: string]: unknown;
  };
  nbformat?: number;
  nbformat_minor?: number;
}

// Type for parsed markdown cells
interface ParsedCell {
  type: string;
  content: string;
  id: string;
  level?: number;
  outputs?: OutputItem[];
  phaseId?: string | null;
}

/**
 * 自定义 Hook 处理 Notebook 导入逻辑，包括自定义格式和 Jupyter Notebook 格式。
 */
const ImportNotebook4JsonOrJupyter = () => {
  const {
    setNotebookId,
    addCell,
    clearCells,
    setCurrentPhase,
    setCurrentStepIndex,
    setViewMode,
    setCurrentRunningPhaseId,
    setError,
  } = useStore();

  // 获取 set 函数用于直接设置 store 状态
  const set = useStore.setState;

  const { toast } = useToast();

  const initializeNotebook = useCallback(async () => {
    try {
      const result = await NotebookLifecycleService.initializeNotebook();
      const notebook_id = result.notebook_id;
      if (notebook_id) {
        setNotebookId(notebook_id);
        toast({
          title: 'Success',
          description: 'New Notebook created successfully',
          variant: 'default',
        });
      } else {
        throw new Error('Failed to create Notebook');
      }
    } catch (err) {
      fileLog.error('Error creating Notebook', { error: err });
      setError('Failed to create Notebook. Please try again.');
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [setNotebookId, setError, toast]);

  // Import Custom Notebook format
  const importCustomNotebook = useCallback(
    async (importedData: CustomNotebookData): Promise<void> => {
      if (!importedData.cells || !Array.isArray(importedData.cells)) {
        throw new Error('Invalid Notebook format: Missing cells array');
      }

      // 检查导入的内容是否包含标题
      const hasTitle = importedData.cells.some((cell: Cell) => {
        if (cell.type === 'markdown') {
          const content = cell.content.trim();
          return content.startsWith('#');
        }
        return false;
      });

      // 如果导入的内容包含标题，则完全清空；否则保留默认标题
      if (hasTitle) {
        // 完全清空，不创建默认标题
        set({ cells: [], tasks: [], currentRunningPhaseId: null });
      } else {
        clearCells(); // 创建默认标题
      }

      await initializeNotebook();

      const titleStack: number[] = []; // 初始化标题堆栈

      // 导入单元格
      for (let index = 0; index < importedData.cells.length; index++) {
        const cell: Cell = importedData.cells[index];
        if (cell.type === 'markdown') {
          const parsedCells: ParsedCell[] = parseMarkdownContent(cell.content, titleStack);
          parsedCells.forEach((parsedCell: ParsedCell) => {
            const cellWithNewId: Cell = {
              ...parsedCell,
              type: parsedCell.type as CellType,
              id: `imported-${uuidv4()}`,
              outputs: parsedCell.outputs || [],
              phaseId: parsedCell.phaseId || null,
            };
            addCell(cellWithNewId);
          });
        } else {
          const cellWithNewId: Cell = {
            ...cell,
            id: `imported-${uuidv4()}`,
            outputs: cell.outputs || [],
            phaseId: cell.phaseId || null,
          };
          addCell(cellWithNewId);
        }
      }

      // 重置视图状态
      setCurrentPhase(null);
      setCurrentStepIndex(0);
      setViewMode('create');
      setCurrentRunningPhaseId(null);
    },
    [
      clearCells,
      initializeNotebook,
      addCell,
      setCurrentPhase,
      setCurrentStepIndex,
      setViewMode,
      setCurrentRunningPhaseId,
      set,
    ] // setNotebookId is a stable store setter
  );

  // Import Jupyter Notebook format
  const importJupyterNotebook = useCallback(
    async (jupyterData: JupyterNotebookData): Promise<void> => {
      if (!jupyterData.cells || !Array.isArray(jupyterData.cells)) {
        throw new Error('Invalid Jupyter Notebook format: Missing cells array');
      }

      // 检查导入的内容是否包含标题
      const hasTitle = jupyterData.cells.some((cell: JupyterCell) => {
        if (cell.cell_type === 'markdown') {
          const content = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
          return content.trim().startsWith('#');
        }
        return false;
      });

      // 如果导入的内容包含标题，则完全清空；否则保留默认标题
      if (hasTitle) {
        // 完全清空，不创建默认标题
        set({ cells: [], tasks: [], currentRunningPhaseId: null });
      } else {
        clearCells(); // 创建默认标题
      }

      // 处理 notebook_id，根据 Jupyter 元数据或其他字段设置
      if (jupyterData.metadata && jupyterData.metadata.name) {
        setNotebookId(jupyterData.metadata.name);
      } else {
        await initializeNotebook();
      }

      const titleStack: number[] = []; // 初始化标题堆栈

      // 导入 Jupyter 单元格
      for (let index = 0; index < jupyterData.cells.length; index++) {
        const cell: JupyterCell = jupyterData.cells[index];
        if (cell.cell_type === 'markdown') {
          const content: string = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
          const parsedCells: ParsedCell[] = parseMarkdownContent(content, titleStack);
          parsedCells.forEach((parsedCell: ParsedCell) => {
            const newCell: Cell = {
              ...parsedCell,
              type: parsedCell.type as CellType,
              id: `imported-${uuidv4()}`,
              phaseId: null, // 如果需要，可以设置 phaseId
              outputs: [],
            };
            addCell(newCell);
          });
        } else if (cell.cell_type === 'code') {
          const newCell: Cell = {
            id: `imported-${uuidv4()}`,
            type: 'code',
            content: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
            outputs: Array.isArray(cell.outputs)
              ? cell.outputs.map((output: any) => ({
                  type: output.output_type || 'text',
                  content: JSON.stringify(output.data || output.text || ''),
                }))
              : [],
            phaseId: null, // 设置 phaseId 如果需要
          };
          addCell(newCell);
        } else {
          // 处理其他类型的单元格
          const newCell: Cell = {
            id: `imported-${uuidv4()}`,
            type: cell.cell_type as CellType,
            content: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
            outputs: Array.isArray(cell.outputs)
              ? cell.outputs.map((output: any) => ({
                  type: output.output_type || 'text',
                  content: JSON.stringify(output.data || output.text || ''),
                }))
              : [],
            phaseId: null,
          };
          addCell(newCell);
        }
      }

      // 重置视图状态
      setCurrentPhase(null);
      setCurrentStepIndex(0);
      setViewMode('create');
      setCurrentRunningPhaseId(null);
    },
    [
      clearCells,
      initializeNotebook,
      addCell,
      setCurrentPhase,
      setCurrentStepIndex,
      setViewMode,
      setCurrentRunningPhaseId,
      set,
    ] // setNotebookId is a stable store setter
  );

  // 处理文件导入
  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file: File | undefined = e.target.files?.[0];
      if (!file) return;

      const fileExtension: string = file.name.split('.').pop()?.toLowerCase() || '';

      if (fileExtension === 'ipynb') {
        // **[Modification 1]**: 检查是否为 Jupyter Notebook 文件
        // 处理 Jupyter Notebook 文件导入
        const reader: FileReader = new FileReader();
        reader.onload = async (event: ProgressEvent<FileReader>) => {
          try {
            const result = event.target?.result as string;
            if (!result) throw new Error('Failed to read file');
            const jupyterData: JupyterNotebookData = JSON.parse(result);
            await importJupyterNotebook(jupyterData);
            toast({
              title: 'Success',
              description: 'Jupyter Notebook imported successfully',
              variant: 'default',
            });
            e.target.value = ''; // 清除文件输入
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            fileLog.error('Error importing Jupyter Notebook', { error: err });
            setError(
              'Failed to import Jupyter Notebook. Please check the file format and try again.'
            );
            toast({
              title: 'Error',
              description: errorMessage,
              variant: 'destructive',
            });
          }
        };
        reader.readAsText(file);
      } else {
        // **[Modification 2]**: 默认处理自定义格式
        // 处理自定义 Notebook 格式导入
        const reader: FileReader = new FileReader();
        reader.onload = async (event: ProgressEvent<FileReader>) => {
          try {
            const result = event.target?.result as string;
            if (!result) throw new Error('Failed to read file');
            const importedData: CustomNotebookData = JSON.parse(result);
            await importCustomNotebook(importedData);
            toast({
              title: 'Success',
              description: 'Custom Notebook imported successfully',
              variant: 'default',
            });
            e.target.value = ''; // 清除文件输入
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            fileLog.error('Error importing custom Notebook', { error: err });
            setError('Failed to import Notebook. Please check the file format and try again.');
            toast({
              title: 'Error',
              description: errorMessage,
              variant: 'destructive',
            });
          }
        };
        reader.readAsText(file);
      }
    },
    [importJupyterNotebook, importCustomNotebook, toast, setError]
  );

  return { handleImport, initializeNotebook };
};

export default ImportNotebook4JsonOrJupyter;
