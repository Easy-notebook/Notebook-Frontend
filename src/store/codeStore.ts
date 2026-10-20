// store/codeStore.ts
import { create } from 'zustand';
import useStore from '@Store/notebookStore';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';
import { KernelSession } from '@Services/notebook/KernelSession';
import { CellStatusPoller } from '@Services/notebook/CellStatusPoller';
import { CodeExecutionService } from '@Services/notebook/CodeExecutionService';
import { NativeCellExecution } from '@Services/notebook/NativeCellExecution';
import { storeLog } from '@Utils/logger';
import { CellExecutionSession } from '@Services/notebook/CellExecutionSession';
import {
  DISPLAY_MODES,
  type DisplayMode,
  type CellExecutionState,
  type ExecutionResult,
} from '@Store/models';

// Re-export display modes for backward compatibility with UI imports
export { DISPLAY_MODES } from '@Store/models';

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

const useCodeStore = create<CodeStore>((set, get) => {
  const kernel = new KernelSession({
    notebookId: () => useStore.getState().notebookId,
    ready: () => get().isKernelReady,
    watch: (listener) =>
      useStore.subscribe((state, previous) => listener(previous.notebookId, state.notebookId)),
    create: () => NotebookLifecycleService.initializeNotebook(),
    restart: (id) => NotebookLifecycleService.restartNotebook(id),
    adopt: (id) => useStore.getState().setNotebookId(id, { preserveContent: true }),
    publish: (ready, error) => set({ isKernelReady: ready, error }),
  });
  const polling = new CellStatusPoller({
    notebookId: () => useStore.getState().notebookId,
    hasCell: (id) => useStore.getState().cells.some((cell) => cell.id === id),
    executing: (id) => get().getCellExecState(id).isExecuting,
    executionPending: (id) => execution.isActive(id),
    watch: (check) => useStore.subscribe(check),
    status: (notebookId, signal) => CodeExecutionService.getExecutionStatus(notebookId, signal),
    update: (id, state) => get().setCellExecState(id, state),
    outputs: (id, outputs) => useStore.getState().updateCellOutputs(id, outputs),
    error: (cellId, error) =>
      storeLog.error('Error checking execution status', {
        cellId,
        error: error instanceof Error ? error.message : String(error),
      }),
  });
  const execution = new CellExecutionSession({
    notebookId: () => useStore.getState().notebookId,
    cell: (id) => useStore.getState().cells.find((cell) => cell.id === id),
    watch: (check) => useStore.subscribe(check),
    initialize: (language) =>
      language === 'aal'
        ? Promise.resolve(useStore.getState().notebookId || false)
        : get().initializeKernel(),
    execute: (code, owner, signal, language, cellId) =>
      language === 'aal'
        ? new NativeCellExecution(owner, cellId).execute(code, signal)
        : CodeExecutionService.executeCode(code, owner, signal),
    cancel: (owner, signal, language) =>
      language === 'aal'
        ? Promise.resolve({
            status: 'error',
            message:
              'AAL cells finish within a 10 second worker deadline; server cancellation is unavailable',
          })
        : CodeExecutionService.cancelExecution(owner, signal),
    update: (id, state) => get().setCellExecState(id, state),
    clear: (id) => useStore.getState().clearCellOutputs(id),
    outputs: (id, outputs) => useStore.getState().updateCellOutputs(id, outputs),
    save: () => useStore.getState().triggerAutoSave(),
    startPolling: (id, language) => {
      if (language !== 'aal') polling.start(id);
    },
    stopPolling: (id) => polling.stop(id),
  });
  return {
    // ========== 全局内核状态 ==========
    isKernelReady: false,
    error: null,

    // ========== 每个 Cell 的执行状态 ==========
    cellExecStates: {},

    // ========== 每个 Cell 的显示模式 ==========
    cellModes: {},

    // ========== Actions: 内核相关 ==========
    setKernelReady: (ready: boolean) => {
      kernel.invalidate();
      set({ isKernelReady: ready });
    },
    setError: (err: string | null) => set({ error: err }),

    initializeKernel: () => kernel.initialize(),
    restartKernel: () => {
      execution.reset(true);
      return kernel.restart();
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
            },
          },
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
            ...partial,
          },
        },
      }));
    },

    stopStatusCheck: (cellId: string) => polling.stop(cellId),
    startStatusCheck: (cellId: string) => polling.start(cellId),

    cancelCellExecution: (cellId: string) => execution.cancel(cellId),
    executeCell: (cellId: string) => execution.execute(cellId),

    // ========== 显示模式管理 ==========
    setCellMode: (cellId: string, mode: DisplayMode) => {
      set((prev) => ({
        cellModes: {
          ...prev.cellModes,
          [cellId]: mode,
        },
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
    resetAll: () => {
      kernel.invalidate();
      execution.reset();
      polling.reset();
      set({
        isKernelReady: false,
        error: null,
        cellExecStates: {},
        cellModes: {},
      });
    },
  };
});

export default useCodeStore;
