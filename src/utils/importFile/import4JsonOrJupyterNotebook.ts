// components/Notebook/useImportNotebook.js

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import useStore from '../../store/notebookStore';
import { useToast } from '../../components/UI/Toast';
import { notebookApiIntegration } from '../../services/notebookServices';

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
            const notebook_id = await notebookApiIntegration.initializeNotebook();
            if (notebook_id) {
                setNotebookId(notebook_id);
                toast({
                    title: "Success",
                    description: "New Notebook created successfully",
                    variant: "success",
                });
            } else {
                throw new Error('Failed to create Notebook');
            }
        } catch (err) {
            console.error('Error creating Notebook:', err);
            setError('Failed to create Notebook. Please try again.');
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive",
            });
        }
    }, [setNotebookId, setError, toast]);

    /**
     * 解析 Markdown 内容，分离标题和正文，并根据标题层级管理堆栈结构
     * @param {string} content - Markdown 内容
     * @param {Array} stack - 当前的标题堆栈
     * @returns {Array} - 分离后的单元格数组
     */
    const parseMarkdownContent = (content, stack) => {
        const lines = content.split('\n');
        const cells = [];
        let currentContent = [];

        lines.forEach(line => {
            const titleMatch = line.match(/^(#{1,6})\s+(.*)/);
            if (titleMatch) {
                // 如果当前有正文内容，先将其作为一个单元格添加
                if (currentContent.length > 0) {
                    cells.push({
                        type: 'markdown',
                        content: currentContent.join('\n'),
                        id: `content-${uuidv4()}`,
                    });
                    currentContent = [];
                }

                const hashes: string = titleMatch[1];
                const titleText: string = titleMatch[2].trim();
                let level: number = hashes.length;

                // 根据堆栈管理标题层级
                while (stack.length > 0 && stack[stack.length - 1] >= level) {
                    stack.pop();
                }
                const currentLevel: number = stack.length + 1;
                stack.push(level);

                // 创建标题单元格
                cells.push({
                    type: 'markdown',
                    content: `${'#'.repeat(currentLevel)} ${titleText}`,
                    id: `title-${uuidv4()}`,
                    level: currentLevel, // 记录标题级别
                });
            } else {
                currentContent.push(line);
            }
        });

        // 添加剩余的正文内容
        if (currentContent.length > 0) {
            cells.push({
                type: 'markdown',
                content: currentContent.join('\n'),
                id: `content-${uuidv4()}`,
            });
        }

        return cells;
    };

    // Import Custom Notebook format
    const importCustomNotebook = useCallback(async (importedData: CustomNotebookData): Promise<void> => {
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
        for (let index: number = 0; index < importedData.cells.length; index++) {
            const cell: Cell = importedData.cells[index];
            if (cell.type === 'markdown') {
                const parsedCells: ParsedCell[] = parseMarkdownContent(cell.content, titleStack);
                parsedCells.forEach((parsedCell: ParsedCell) => {
                    const cellWithNewId: Cell = {
                        ...parsedCell,
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
    }, [
        clearCells,
        setNotebookId,
        initializeNotebook,
        addCell,
        setCurrentPhase,
        setCurrentStepIndex,
        setViewMode,
        setCurrentRunningPhaseId,
    ]);

    // Import Jupyter Notebook format
    const importJupyterNotebook = useCallback(async (jupyterData: JupyterNotebookData): Promise<void> => {
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
        for (let index: number = 0; index < jupyterData.cells.length; index++) {
            const cell: JupyterCell = jupyterData.cells[index];
            if (cell.cell_type === 'markdown') {
                const content: string = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                const parsedCells: ParsedCell[] = parseMarkdownContent(content, titleStack);
                parsedCells.forEach((parsedCell: ParsedCell) => {
                    const newCell: Cell = {
                        ...parsedCell,
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
                    outputs: Array.isArray(cell.outputs) ? cell.outputs.map((output: any) => ({
                        output_type: output.output_type,
                        data: output.data || {},
                        execution_count: output.execution_count || null,
                    })) : [],
                    phaseId: null, // 设置 phaseId 如果需要
                };
                addCell(newCell);
            } else {
                // 处理其他类型的单元格
                const newCell: Cell = {
                    id: `imported-${uuidv4()}`,
                    type: cell.cell_type,
                    content: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
                    outputs: Array.isArray(cell.outputs) ? cell.outputs.map((output: any) => ({
                        output_type: output.output_type,
                        data: output.data || {},
                        execution_count: output.execution_count || null,
                    })) : [],
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
    }, [
        clearCells,
        setNotebookId,
        initializeNotebook,
        addCell,
        setCurrentPhase,
        setCurrentStepIndex,
        setViewMode,
        setCurrentRunningPhaseId,
    ]);

    // 处理文件导入
    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file: File | undefined = e.target.files?.[0];
        if (!file) return;

        const fileExtension: string = file.name.split('.').pop()?.toLowerCase() || '';

        if (fileExtension === 'ipynb') {  // **[Modification 1]**: 检查是否为 Jupyter Notebook 文件
            // 处理 Jupyter Notebook 文件导入
            const reader: FileReader = new FileReader();
            reader.onload = async (event: ProgressEvent<FileReader>) => {
                try {
                    const result = event.target?.result as string;
                    if (!result) throw new Error('Failed to read file');
                    const jupyterData: JupyterNotebookData = JSON.parse(result);
                    await importJupyterNotebook(jupyterData);
                    toast({
                        title: "Success",
                        description: "Jupyter Notebook imported successfully",
                        variant: "success",
                    });
                    e.target.value = ''; // 清除文件输入
                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    console.error('Error importing Jupyter Notebook:', err);
                    setError('Failed to import Jupyter Notebook. Please check the file format and try again.');
                    toast({
                        title: "Error",
                        description: errorMessage,
                        variant: "destructive",
                    });
                }
            };
            reader.readAsText(file);
        } else {  // **[Modification 2]**: 默认处理自定义格式
            // 处理自定义 Notebook 格式导入
            const reader: FileReader = new FileReader();
            reader.onload = async (event: ProgressEvent<FileReader>) => {
                try {
                    const result = event.target?.result as string;
                    if (!result) throw new Error('Failed to read file');
                    const importedData: CustomNotebookData = JSON.parse(result);
                    await importCustomNotebook(importedData);
                    toast({
                        title: "Success",
                        description: "Custom Notebook imported successfully",
                        variant: "success",
                    });
                    e.target.value = ''; // 清除文件输入
                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    console.error('Error importing custom Notebook:', err);
                    setError('Failed to import Notebook. Please check the file format and try again.');
                    toast({
                        title: "Error",
                        description: errorMessage,
                        variant: "destructive",
                    });
                }
            };
            reader.readAsText(file);
        }
    }, [
        importJupyterNotebook,
        importCustomNotebook,
        toast,
        setError,
    ]);

    return { handleImport, initializeNotebook };
};

export default ImportNotebook4JsonOrJupyter;