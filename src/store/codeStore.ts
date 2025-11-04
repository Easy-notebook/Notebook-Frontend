// store/codeStore.ts
import { create } from 'zustand';
import useStore from './notebookStore';
import { NotebookApiService } from '../services/notebookServices';

// 显示模式常量
export const DISPLAY_MODES = {
    COMPLETE: 'complete',
    CODE_ONLY: 'code_only',
    OUTPUT_ONLY: 'output_only'
} as const;

// 显示模式类型
export type DisplayMode = typeof DISPLAY_MODES[keyof typeof DISPLAY_MODES];

/**
 * 单个 Cell 的执行状态接口
 */
export interface CellExecutionState {
    isExecuting: boolean;
    isCancelling: boolean;
    elapsedTime: number;
    statusCheckInterval: NodeJS.Timeout | null;
}

/**
 * 执行结果接口
 */
export interface ExecutionResult {
    success: boolean;
    error?: string;
    outputs?: any[];
}

/**
 * 内核初始化结果接口
 */
export interface KernelInitResult {
    status: string;
    notebook_id?: string;
    message?: string;
}

/**
 * 执行状态响应接口
 */
export interface ExecutionStatus {
    status: 'running' | 'idle' | 'error';
    elapsed_time?: number;
    outputs?: any[];
}

/**
 * Code Store 状态接口
 */
export interface CodeStoreState {
    // ========== 全局内核状态 ==========
    isKernelReady: boolean;
    error: string | null;

    cellExecStates: Record<string, CellExecutionState>;

    // ========== 每个 Cell 的显示模式 ==========
    cellModes: Record<string, DisplayMode>;
}

/**
 * Code Store Actions 接口
 */
export interface CodeStoreActions {
    // ========== Actions: 内核相关 ==========
    setKernelReady: (ready: boolean) => void;
    setError: (err: string | null) => void;
    initializeKernel: () => Promise<string | false>;
    restartKernel: () => Promise<boolean>;

    // ========== Actions: 每个 Cell 的执行状态管理 ==========
    initCellExecState: (cellId: string) => void;
    getCellExecState: (cellId: string) => CellExecutionState;
    setCellExecState: (cellId: string, partial: Partial<CellExecutionState>) => void;
    stopStatusCheck: (cellId: string) => void;
    startStatusCheck: (cellId: string) => void;
    cancelCellExecution: (cellId: string) => Promise<ExecutionResult>;
    executeCell: (cellId: string) => Promise<ExecutionResult>;

    // ========== 显示模式管理 ==========
    setCellMode: (cellId: string, mode: DisplayMode) => void;
    setCurrentCellMode_onlyCode: () => void;
    setCurrentCellMode_onlyOutput: () => void;
    setCurrentCellMode_complete: () => void;

    // ========== 重置 ==========
    resetAll: () => void;
}

/**
 * 完整的 Code Store 类型
 */
export type CodeStore = CodeStoreState & CodeStoreActions;

/**
 * 在这个 store 中，统一管理：
 * 1) 内核状态 (isKernelReady, error)
 * 2) 每个 Cell 的执行状态 (isExecuting, elapsedTime, isCancelling, etc.)
 * 3) 轮询逻辑
 * 4) 单个 Cell 执行 / 取消执行方法
 */
const useCodeStore = create<CodeStore>((set, get) => ({
    // ========== 全局内核状态 ==========
    isKernelReady: false,
    error: null,

    // ========== 每个 Cell 的执行状态 ==========
    cellExecStates: {},

    // ========== 每个 Cell 的显示模式 ==========
    cellModes: {},

    // ========== Actions: 内核相关 ==========
    setKernelReady: (ready: boolean) => set({ isKernelReady: ready }),
    setError: (err: string | null) => set({ error: err }),

    initializeKernel: async (): Promise<string | false> => {
        if (get().isKernelReady) return useStore.getState().notebookId || false;

        try {
            get().setError(null);
            const result: KernelInitResult = await NotebookApiService.initializeNotebook();
            if (result.status === 'ok') {
                get().setKernelReady(true);
                if (result.notebook_id) {
                    useStore.getState().setNotebookId(result.notebook_id);
                }
                return result.notebook_id || '';
            } else {
                throw new Error(result.message || '内核初始化失败');
            }
        } catch (error: any) {
            console.error('initializeKernel error:', error);
            get().setKernelReady(false);
            get().setError(error.message);
            return false;
        }
    },

    restartKernel: async (): Promise<boolean> => {
        try {
            get().setError(null);
            const result: KernelInitResult = await NotebookApiService.restartNotebook();
            if (result.status === 'ok') {
                get().setKernelReady(true);
                return true;
            } else {
                throw new Error(result.message || '内核重启失败');
            }
        } catch (error: any) {
            console.error('restartKernel error:', error);
            get().setKernelReady(false);
            get().setError(error.message);
            return false;
        }
    },

    // ========== Actions: 每个 Cell 的执行状态管理 ==========
    initCellExecState: (cellId: string) => {
        const state = get();
        if (!state.cellExecStates[cellId]) {
            set((prev) => ({
                cellExecStates: {
                    ...prev.cellExecStates,
                    [cellId]: {
                        isExecuting: false,
                        isCancelling: false,
                        elapsedTime: 0,
                        statusCheckInterval: null,
                    }
                }
            }));
        }
    },

    getCellExecState: (cellId: string): CellExecutionState => {
        const execStates = get().cellExecStates;
        // 如果还没有初始化过，就返回一个默认状态
        if (!execStates[cellId]) {
            return {
                isExecuting: false,
                isCancelling: false,
                elapsedTime: 0,
                statusCheckInterval: null,
            };
        }
        return execStates[cellId];
    },

    setCellExecState: (cellId: string, partial: Partial<CellExecutionState>) => {
        set((prev) => ({
            cellExecStates: {
                ...prev.cellExecStates,
                [cellId]: {
                    ...prev.cellExecStates[cellId],
                    ...partial
                }
            }
        }));
    },

    // 停止定时器
    stopStatusCheck: (cellId: string) => {
        const cellExec = get().getCellExecState(cellId);
        if (cellExec.statusCheckInterval) {
            clearInterval(cellExec.statusCheckInterval);
        }
        get().setCellExecState(cellId, { statusCheckInterval: null });
    },

    // 启动定时器，每秒检查一次执行状态
    startStatusCheck: (cellId: string) => {
        const notebookId = useStore.getState().notebookId;
        if (!notebookId) {
            console.error('Notebook ID 不存在，无法开始状态轮询');
            return;
        }
        // 先停掉旧的
        get().stopStatusCheck(cellId);

        const intervalId = setInterval(async () => {
            try {
                const status: ExecutionStatus = await NotebookApiService.getExecutionStatus(notebookId);
                const cellExec = get().getCellExecState(cellId);
                // 如果已经不在执行，就停止轮询
                if (!cellExec.isExecuting) {
                    clearInterval(intervalId);
                    return;
                }

                if (status.status === 'running') {
                    get().setCellExecState(cellId, { elapsedTime: status.elapsed_time || 0 });
                    if (status.outputs?.length && status.outputs.length > 0) {
                        useStore.getState().updateCellOutputs(cellId, status.outputs);
                    }
                } else {
                    // 执行结束
                    clearInterval(intervalId);
                    get().setCellExecState(cellId, {
                        isExecuting: false,
                        elapsedTime: 0,
                        statusCheckInterval: null
                    });
                    if (status.outputs?.length && status.outputs.length > 0) {
                        useStore.getState().updateCellOutputs(cellId, status.outputs);
                    }
                }
            } catch (err: any) {
                console.error('检查执行状态错误:', err);
                clearInterval(intervalId);
                get().setCellExecState(cellId, {
                    isExecuting: false,
                    statusCheckInterval: null
                });
            }
        }, 1000);

        get().setCellExecState(cellId, { statusCheckInterval: intervalId });
    },

    // 取消执行
    cancelCellExecution: async (cellId: string): Promise<ExecutionResult> => {
        const notebookId = useStore.getState().notebookId;
        if (!notebookId) {
            console.error('Notebook ID 不存在，无法取消执行');
            return { success: false, error: 'no_notebook_id' };
        }
        get().setCellExecState(cellId, { isCancelling: true });

        try {
            await NotebookApiService.cancelExecution(notebookId);
            get().stopStatusCheck(cellId);
            get().setCellExecState(cellId, {
                isExecuting: false,
                elapsedTime: 0,
            });
            return { success: false, error: 'canceled_by_user' };
        } catch (error: any) {
            console.error('取消执行错误:', error);
            return { success: false, error: error.message };
        } finally {
            get().setCellExecState(cellId, { isCancelling: false });
        }
    },

    // 执行单个 Cell
    executeCell: async (cellId: string): Promise<ExecutionResult> => {
        // 如果正在执行 => 视作"取消"
        const cellExec = get().getCellExecState(cellId);
        if (cellExec.isExecuting) {
            return get().cancelCellExecution(cellId);
        }

        // 如果内核没就绪，先初始化
        const ok = await get().initializeKernel();
        const notebookId = useStore.getState().notebookId;
        const notebookState = useStore.getState();
        if (!ok) {
            return { success: false, error: '内核初始化失败' };
        }
        if (notebookId) {
            await NotebookApiService.executeCode('print("fast check")', notebookId);
        }

        // 清除旧输出
        notebookState.clearCellOutputs(cellId);
        // 设置 isExecuting
        get().setCellExecState(cellId, {
            isExecuting: true,
            elapsedTime: 0,
        });

        // 开始轮询
        get().startStatusCheck(cellId);

        // 真正发起执行请求
        try {
            const codeCell = notebookState.cells.find((c) => c.id === cellId);
            if (!codeCell) {
                // Cell 不存在
                get().stopStatusCheck(cellId);
                get().setCellExecState(cellId, { isExecuting: false });
                return { success: false, error: 'Cell 不存在' };
            }

            const result = await NotebookApiService.executeCode(codeCell.content, notebookId!);
            // 更新 outputs
            notebookState.updateCellOutputs(cellId, result.outputs || []);

            let hasError = false;
            let error: string | null = null;
            if (result.outputs) {
                for (let output of result.outputs) {
                    if (output.type === 'error') {
                        hasError = true;
                        error = output.content;
                        break;
                    }
                }
            }

            // 停止轮询
            get().stopStatusCheck(cellId);
            get().setCellExecState(cellId, {
                isExecuting: false,
                elapsedTime: 0,
            });

            if (hasError) {
                return { success: false, error: error || 'Unknown error' };
            }

            return { success: true, outputs: result.outputs };
        } catch (error: any) {
            console.error('执行单元格错误:', error);
            notebookState.updateCellOutputs(cellId, [
                { type: 'error', content: error.message }
            ]);
            get().stopStatusCheck(cellId);
            get().setCellExecState(cellId, { isExecuting: false });
            return { success: false, error: error.message };
        }
    },

    // ========== 显示模式管理 ==========
    setCellMode: (cellId: string, mode: DisplayMode) => {
        set((prev) => ({
            cellModes: {
                ...prev.cellModes,
                [cellId]: mode,
            }
        }));
    },

    setCurrentCellMode_onlyCode: () => {
        const cellId = useStore.getState().currentCellId;
        if (cellId) {
            get().setCellMode(cellId, DISPLAY_MODES.CODE_ONLY);
        }
    },
    setCurrentCellMode_onlyOutput: () => {
        const cellId = useStore.getState().currentCellId;
        if (cellId) {
            get().setCellMode(cellId, DISPLAY_MODES.OUTPUT_ONLY);
        }
    },
    setCurrentCellMode_complete: () => {
        const cellId = useStore.getState().currentCellId;
        if (cellId) {
            get().setCellMode(cellId, DISPLAY_MODES.COMPLETE);
        }
    },

    // ========== 重置 ==========
    resetAll: () => set({
        isKernelReady: false,
        error: null,
        cellExecStates: {},
        cellModes: {}
    }),
}));

export default useCodeStore;