// store/notebookStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { produce } from 'immer';

import { parseMarkdownCells, findCellsByPhase, findCellsByStep, updateCellsPhaseId } from '../utils/markdownParser';
import { showToast } from '../components/UI/Toast';
import notebookAutoSaveInstance, { NotebookAutoSave } from '../services/notebookAutoSave';
import { notebookLog, storeLog } from '../utils/logger';

import useCodeStore from './codeStore';

/** 单元格类型 */
export type CellType = 'code' | 'markdown' | 'raw' | 'hybrid' | 'image' | 'thinking' | 'link';
/** 视图模式类型 */
export type ViewMode = 'step' | 'demo' | 'create';
/** 上传模式类型 */
export type UploadMode = 'unrestricted' | 'restricted';

/** 输出项接口 */
export interface OutputItem {
  type: string;
  content: any;
  timestamp?: string;
}

/** 单元格接口 */
export interface Cell {
  id: string;
  type: CellType;
  content: string;
  outputs?: OutputItem[];
  enableEdit?: boolean;
  phaseId?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
}

/** 步骤接口 */
export interface Step {
  id: string;
  title: string;
  status?: 'pending' | 'running' | 'completed' | 'error';
  startIndex?: number | null;
  endIndex?: number | null;
  content?: Cell[];
  cellIds?: string[];
}

/** 阶段接口 */
export interface Phase {
  id: string;
  title: string;
  steps: Step[];
  icon?: any;
  status?: 'pending' | 'running' | 'completed' | 'error';
  intro?: Cell[];
}

/** 任务接口 */
export interface Task {
  id: string;
  title: string;
  phases: Phase[];
}

/** 运行结果接口 */
export interface RunResult {
  success: boolean;
  error?: string;
}

/** Toast 消息接口 */
export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

/** Notebook Store 状态接口 */
export interface NotebookStoreState {
  notebookId: string | null;
  notebookTitle: string;
  cells: Cell[];
  tasks: Task[];
  currentPhaseId: string | null;
  currentStepIndex: number;
  viewMode: ViewMode;
  currentCellId: string | null;
  isExecuting: boolean;
  currentRunningPhaseId: string | null;
  allowPagination: boolean;
  lastAddedCellId: string | null;

  error: string | null;
  isCollapsed: boolean;
  uploadMode: UploadMode;
  allowedTypes: string[];
  maxFiles: number | null;
  isRightSidebarCollapsed: boolean;
  editingCellId: string | null;

  whatPurposeOfThisNotebook: string | null;
  whatHaveWeDone: string | null;
  whatIsOurCurrentWork: string | null;

  showButtons: Record<string, boolean>;

  // 独立窗口状态
  detachedCellId: string | null;
  isDetachedCellFullscreen: boolean;

  // 初始化状态
  isInitialized: boolean;
}

/** Notebook Store Actions 接口 */
export interface NotebookStoreActions {
  // 基础获取器
  getCurrentCellId: () => string | null;
  getCurrentCell: () => Cell | undefined;

  // 编辑状态管理
  setEditingCellId: (id: string | null) => void;
  setEditingCellId2NULL: () => void;

  // 基础状态设置
  setError: (error: string | null) => void;
  setIsCollapsed: (isCollapsed: boolean) => void;
  setLastAddedCellId: (id: string | null) => void;
  setUploadMode: (uploadMode: UploadMode) => void;
  setAllowedTypes: (allowedTypes: string[]) => void;
  setMaxFiles: (maxFiles: number | null) => void;
  setIsRightSidebarCollapsed: (isRightSidebarCollapsed: boolean) => void;
  setNotebookId: (id: string | null) => void;
  setNotebookTitle: (title: string) => void;
  setCurrentPhase: (phaseId: string | null) => void;
  setCurrentStepIndex: (index: number) => void;
  setCurrentCell: (cellId: string | null) => void;
  setCurrentRunningPhaseId: (phaseId: string | null) => void;
  setAllowPagination: (allow: boolean) => void;
  setShowButtons: (cellId: string, value: boolean) => void;

  // 单元格管理
  clearCells: () => void;
  clearAllOutputs: () => void;
  clearCellOutputs: (cellId: string) => void;
  setCells: (cells: Cell[]) => void;
  updateCurrentCellWithContent: (content: string) => void;
  addCell: (newCell: Partial<Cell>, index?: number) => void;
  updateTitle: (title: string) => void;
  updateCurrentCellDescription: (description: string) => void;
  addNewContent2CurrentCellDescription: (content: string) => void;
  deleteCell: (cellId: string) => void;
  updateCell: (cellId: string, newContent: string) => void;
  updateCellOutputs: (cellId: string, outputs: OutputItem[]) => void;
  moveCellToIndex: (fromIndex: number, toIndex: number) => void;

  // 视图模式管理
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;

  // 代码执行
  runSingleCell: (cellId: string) => Promise<RunResult>;
  runAllCells: () => Promise<void>;
  runCurrentCodeCell: () => Promise<void>;

  // 单元格创建
  addNewCell2End: (type: CellType, description?: string, enableEdit?: boolean) => string;
  addNewCellWithUniqueIdentifier: (type: CellType, description?: string, enableEdit?: boolean, uniqueIdentifier?: string, prompt?: string) => string;
  updateCellByUniqueIdentifier: (uniqueIdentifier: string, updates: Partial<Cell>) => boolean;
  addNewCell2Next: (type: CellType, description?: string, enableEdit?: boolean) => void;
  addNewContent2CurrentCell: (content: string) => void;

  // 单元格类型获取
  getCurrentCellType: () => CellType;

  // 输出检查
  checkOutputsIsError: (outputs: OutputItem[]) => boolean;
  checkCurrentCodeCellOutputsIsError: () => boolean;

  // 单元格元数据管理
  updateCellCanEdit: (cellId: string, isEditable: boolean) => void;
  updateCellMetadata: (cellId: string, metadata: Record<string, any>) => void;

  // 单元格类型转换
  convertCurrentCodeCellToHybridCell: () => void;
  convertToCodeCell: (cellId: string) => void;
  updateCellType: (cellId: string, newType: CellType) => void;

  // 历史代码获取
  getHistoryCode: () => string;
  getPhaseHistoryCode: (phaseId: string) => string;

  // 阶段和任务管理
  getPhaseById: (phaseId: string) => Phase | null;
  getTaskByPhaseId: (phaseId: string) => Task | null;

  // 视图相关
  getCurrentViewCells: () => Cell[];
  getCurrentStepCellsIDs: () => string[];
  getAllCellsBeforeCurrent: () => Cell[];
  getTotalSteps: () => number;

  // 独立窗口管理
  setDetachedCellId: (cellId: string | null) => void;
  getDetachedCell: () => Cell | null;
  toggleDetachedCellFullscreen: () => void;

  // 自动保存管理
  triggerAutoSave: () => void;
  loadFromDatabase: (notebookId: string) => Promise<boolean>;
  saveNow: () => Promise<void>;
}

/** 完整的 Notebook Store 类型 */
export type NotebookStore = NotebookStoreState & NotebookStoreActions;

/* ------------------------- 序列化 / 反序列化 ------------------------- */
const serializeOutput = (output: any): any => {
  if (!output) return [];
  if (Array.isArray(output)) {
    return output.map(serializeOutput);
  }
  const serialized: any = { ...output };
  if (typeof serialized.content === 'object' && serialized.content !== null) {
    try {
      serialized.content = JSON.stringify(serialized.content);
    } catch {
      serialized.content = String(serialized.content);
    }
  }
  return serialized;
};

const deserializeOutput = (output: any): any => {
  if (!output) return [];
  if (Array.isArray(output)) {
    return output.map(deserializeOutput);
  }
  if (output.content && typeof output.content === 'string') {
    try {
      const parsed = JSON.parse(output.content);
      if (typeof parsed === 'object') {
        return { ...output, content: parsed };
      }
    } catch {
      // 原样返回
    }
  }
  return output;
};

/* ------------------------- 辅助函数 ------------------------- */
/** 修复：不能在 produce(state) 内调用 state 上不存在的函数 */
const updateCellOutputsHelper = (
  set: any,
  get: () => NotebookStore,
  cellId: string,
  outputs: OutputItem[],
) => {
  const serialized = serializeOutput(outputs);
  const outArr: OutputItem[] = Array.isArray(serialized) ? serialized : [];

  const isErr = get().checkOutputsIsError(outArr);

  set(
    produce((state: NotebookStoreState) => {
      const cell = state.cells.find((c) => c.id === cellId);
      if (!cell) return;

      if (outArr.length > 0) {
        cell.outputs = isErr
          ? [
              { type: 'text', content: '[error-message-for-debug]', timestamp: '' },
              ...outArr,
            ]
          : [...outArr];
      } else {
        cell.outputs = [
          { type: 'text', content: '[without-output]', timestamp: '' },
          ...outArr,
        ];
      }
    }),
  );
};

/* ------------------------- Store 实现 ------------------------- */
const useStore = create(
  subscribeWithSelector<NotebookStore>((set, get) => {
    return {
      // ================= 状态 =================
      notebookId: null,
      notebookTitle: '',
      cells: [],
      tasks: [],
      currentPhaseId: null,
      currentStepIndex: 0,
      viewMode: 'create',
      currentCellId: null,
      isExecuting: false,
      currentRunningPhaseId: null,
      allowPagination: true,
      lastAddedCellId: null,

      error: null,
      isCollapsed: true,
      uploadMode: 'unrestricted',
      allowedTypes: [],
      maxFiles: null,
      isRightSidebarCollapsed: false,
      editingCellId: null,

      whatPurposeOfThisNotebook: null,
      whatHaveWeDone: null,
      whatIsOurCurrentWork: null,

      showButtons: {},

      detachedCellId: null,
      isDetachedCellFullscreen: false,

      isInitialized: false,

      // ================= 获取器 =================
      getCurrentCellId: () => get().currentCellId,
      getCurrentCell: () => {
        const state = get();
        return state.cells.find((c) => c.id === state.currentCellId);
      },

      // 新增：一键清空编辑状态
      setEditingCellId2NULL: () => set({ editingCellId: null }),

      // ================= Actions =================
      setEditingCellId: (id: string | null) => set({ editingCellId: id }),
      setError: (error: string | null) => set({ error }),
      setIsCollapsed: (isCollapsed: boolean) => set({ isCollapsed }),
      setLastAddedCellId: (id: string | null) => set({ lastAddedCellId: id }),
      setUploadMode: (uploadMode: UploadMode) => set({ uploadMode }),
      setAllowedTypes: (allowedTypes: string[]) => set({ allowedTypes }),
      setMaxFiles: (maxFiles: number | null) => set({ maxFiles }),
      setIsRightSidebarCollapsed: (isRightSidebarCollapsed: boolean) =>
        set({ isRightSidebarCollapsed }),
      setNotebookId: (id: string | null) => set({ notebookId: id }),

      setNotebookTitle: (title: string) =>
        set((state) => ({
          notebookTitle: title,
          cells: state.cells.map((cell, index) =>
            index === 0 && cell.metadata?.isDefaultTitle
              ? { ...cell, content: `# ${title}` }
              : cell,
          ),
        })),

      setCurrentPhase: (phaseId: string | null) => set({ currentPhaseId: phaseId, currentStepIndex: 0 }),
      setCurrentStepIndex: (index: number) => set({ currentStepIndex: index }),
      setCurrentCell: (cellId: string | null) => set({ currentCellId: cellId }),
      setCurrentRunningPhaseId: (phaseId: string | null) => set({ currentRunningPhaseId: phaseId }),
      setAllowPagination: (allow: boolean) => set({ allowPagination: allow }),
      setShowButtons: (cellId: string, value: boolean) =>
        set(
          produce((state: NotebookStoreState) => {
            state.showButtons[cellId] = value;
          }),
        ),

      clearCells: () => {
        const titleCell: Cell = {
          id: uuidv4(),
          type: 'markdown',
          content: '# Untitled',
          outputs: [],
          enableEdit: true,
          phaseId: null,
          description: null,
          metadata: { isDefaultTitle: true },
        };
        const tasks = parseMarkdownCells([titleCell] as any);
        updateCellsPhaseId([titleCell] as any, tasks);
        set({ cells: [titleCell], tasks, currentRunningPhaseId: null });
      },

      clearAllOutputs: () =>
        set(
          produce((state: NotebookStoreState) => {
            state.cells.forEach((cell) => {
              cell.outputs = [];
            });
          }),
        ),

      clearCellOutputs: (cellId: string) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === cellId);
            if (cell) cell.outputs = [];
          }),
        ),

      setCells: (cells: Cell[]) => {
        if (!Array.isArray(cells)) {
          console.error('setCells called with non-array:', cells, 'Stack trace:', new Error().stack);
          return;
        }

        notebookLog.cellOperation('update', 'batch', {
          cellsCount: cells.length,
          cellTypes: cells.map((c) => ({ id: c.id, type: c.type, contentLength: c.content?.length || 0 })),
          stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n'),
        });

        let processedCells = cells.map((cell) => ({
          ...cell,
          content: typeof cell.content === 'string' ? cell.content : String(cell.content ?? ''),
          outputs: Array.isArray(cell.outputs) ? serializeOutput(cell.outputs) : [],
        }));

        notebookLog.info('Processed cells', {
          originalCount: cells.length,
          processedCount: processedCells.length,
          processedTypes: processedCells.map((c) => ({ id: c.id, type: c.type, contentLength: c.content?.length || 0 })),
        });

        if (processedCells.length === 0) {
          notebookLog.cellOperation('create', 'title', { reason: 'empty cells array' });
          const titleCell: Cell = {
            id: uuidv4(),
            type: 'markdown',
            content: '# Untitled',
            outputs: [],
            enableEdit: true,
            phaseId: null,
            description: null,
            metadata: { isDefaultTitle: true },
          };
          processedCells.unshift(titleCell as any);
        } else {
          notebookLog.debug('Cells not empty - keeping existing cells');
        }

        const tasks = parseMarkdownCells(processedCells as any);
        updateCellsPhaseId(processedCells as any, tasks);

        notebookLog.info('setCells final update', {
          finalCellsCount: processedCells.length,
          finalTasksCount: tasks.length,
          finalCells: processedCells.map((c) => ({ id: c.id, type: c.type, content: (c.content ?? '').substring(0, 50) + '...' })),
        });

        set({ cells: processedCells, tasks, isInitialized: true });
      },

      updateCurrentCellWithContent: (content: string) => {
        const currentCellId = get().currentCellId;
        if (!currentCellId) {
          notebookLog.error('No selected cell available');
          return;
        }
        get().updateCell(currentCellId, content);
      },

      addCell: (newCell: Partial<Cell>, index?: number) =>
        set(
          produce((state: NotebookStoreState) => {
            const isNotebookEmpty = state.cells.length === 0;
            const newIsTitle =
              newCell.type === 'markdown' &&
              typeof newCell.content === 'string' &&
              newCell.content.trim().startsWith('#');

            // 若 notebook 为空且新插入的并非 H1，则先创建默认标题
            if (isNotebookEmpty && !newIsTitle) {
              const titleCell: Cell = {
                id: uuidv4(),
                type: 'markdown',
                content: '# Untitled',
                outputs: [],
                enableEdit: true,
                phaseId: null,
                description: null,
                metadata: { isDefaultTitle: true },
              };
              state.cells.unshift(titleCell);
            }

            const hasDefaultTitle = state.cells[0]?.metadata?.isDefaultTitle === true;
            let targetIndex: number;

            if (typeof index !== 'number' || Number.isNaN(index)) {
              targetIndex = state.cells.length; // 末尾
            } else {
              targetIndex = hasDefaultTitle ? Math.max(1, index) : Math.max(0, index);
              targetIndex = Math.min(targetIndex, state.cells.length); // 防越界
            }

            const cell: Cell = {
              id: newCell.id || uuidv4(),
              type: newCell.type || 'markdown',
              content: typeof newCell.content === 'string' ? newCell.content : String(newCell.content ?? ''),
              outputs: Array.isArray(newCell.outputs) ? serializeOutput(newCell.outputs) : [],
              enableEdit: newCell.enableEdit ?? true,
              phaseId: newCell.phaseId ?? null,
              description: newCell.description ?? null,
              metadata: newCell.metadata ?? null,
            };

            const isNewCellTitle = cell.type === 'markdown' && cell.content.trim().startsWith('#');

            // 若最前是默认标题，且插入位置在它前/相邻且新 cell 是标题，则替换默认标题文本（保留 ID 以便引用）
            if (hasDefaultTitle && targetIndex <= 1 && isNewCellTitle) {
              const defaultCell = state.cells[0];
              state.cells[0] = {
                ...defaultCell,
                ...cell,
                metadata: { ...(cell.metadata || {}), isDefaultTitle: false },
                id: defaultCell.id,
              } as Cell;
            } else {
              state.cells.splice(targetIndex, 0, cell);
            }

            const needsReparse =
              cell.type === 'markdown' && (cell.content.includes('#') || state.tasks.length === 0);

            if (needsReparse) {
              const updatedTasks = parseMarkdownCells(state.cells as any) as any;
              updateCellsPhaseId(state.cells as any, updatedTasks);
              state.tasks = updatedTasks;
            } else {
              notebookLog.debug('Skipping tasks re-parsing for non-title cell');
            }

            state.currentCellId = cell.id;

            if (!state.currentPhaseId) {
              const firstPhase = state.tasks[0]?.phases[0];
              if (firstPhase) {
                state.currentPhaseId = firstPhase.id;
                state.currentStepIndex = 0;
              }
            } else {
              const currentPhase = state.tasks.flatMap((t) => t.phases).find((p) => p.id === state.currentPhaseId);
              if (!currentPhase) {
                const firstPhase = state.tasks[0]?.phases[0];
                if (firstPhase) {
                  state.currentPhaseId = firstPhase.id;
                  state.currentStepIndex = 0;
                }
              }
            }

            const currentPhase = state.tasks.flatMap((t) => t.phases).find((p) => p.id === state.currentPhaseId);
            if (currentPhase && state.currentStepIndex >= currentPhase.steps.length) {
              state.currentStepIndex = Math.max(0, currentPhase.steps.length - 1);
            }
          }),
        ),

      updateTitle: (title: string) =>
        set(
          produce((state: NotebookStoreState) => {
            if (!title) {
              notebookLog.warn('Notebook title cannot be empty');
              return;
            }
            if (state.cells.length === 0) {
              state.cells.push({
                id: uuidv4(),
                type: 'markdown',
                content: `# ${title}`,
                outputs: [],
                enableEdit: true,
                phaseId: null,
              });
            } else {
              const cell = state.cells.find((c) => c.type === 'markdown');
              if (cell) {
                cell.content = `# ${title}`;
              }
            }
          }),
        ),

      updateCurrentCellDescription: (description: string) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === state.currentCellId);
            if (cell) cell.description = description;
          }),
        ),

      addNewContent2CurrentCellDescription: (content: string) => {
        const currentCellId = get().currentCellId;
        if (!currentCellId) return;

        const currentCell = get().cells.find((c) => c.id === currentCellId);
        if (!currentCell) return;

        const updatedDescription = `${currentCell.description || ''}${content}`;
        get().updateCurrentCellDescription(updatedDescription);
        showToast({ message: `内容已添加到单元格 ${currentCellId} 的描述`, type: 'success' });
      },

      deleteCell: (cellId: string) =>
        set(
          produce((state: NotebookStoreState) => {
            const cellToDelete = state.cells.find((c) => c.id === cellId);

            // 防止删除默认标题
            if (cellToDelete?.metadata?.isDefaultTitle) return;

            state.cells = state.cells.filter((c) => c.id !== cellId);

            const updatedTasks = parseMarkdownCells(state.cells as any) as any;
            updateCellsPhaseId(state.cells as any, updatedTasks);
            state.tasks = updatedTasks;

            if (cellToDelete && cellToDelete.phaseId === state.currentPhaseId) {
              const phaseCellsResult = findCellsByPhase(state.tasks as any, state.currentPhaseId!);
              const hasCells =
                phaseCellsResult.intro.length > 0 ||
                phaseCellsResult.steps.some((s) => (s.content?.length || 0) > 0);
              if (!hasCells) {
                state.currentPhaseId = null;
                state.currentStepIndex = 0;
                const firstPhase = state.tasks[0]?.phases[0];
                if (firstPhase) {
                  state.currentPhaseId = firstPhase.id;
                  state.currentStepIndex = 0;
                }
              } else {
                const currentPhase = state.tasks.flatMap((t) => t.phases).find((p) => p.id === state.currentPhaseId);
                if (currentPhase && state.currentStepIndex >= currentPhase.steps.length) {
                  state.currentStepIndex = Math.max(0, currentPhase.steps.length - 1);
                }
              }
            }

            if (state.currentCellId === cellId) {
              state.currentCellId = null;
            }

            delete state.showButtons[cellId];
          }),
        ),

      updateCell: (cellId: string, newContent: string) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === cellId);
            if (cell) {
              const content = typeof newContent === 'string' ? newContent : String(newContent ?? '');
              cell.content = content;

              // 如果是默认标题 cell，同步更新 notebookTitle
              if (cell.metadata?.isDefaultTitle) {
                const titleMatch = content.match(/^#\s*(.*)$/);
                const title = titleMatch ? titleMatch[1].trim() : content.replace(/^#\s*/, '').trim();
                state.notebookTitle = title || 'Untitled';
              }
            }

            const updatedTasks = parseMarkdownCells(state.cells as any) as any;
            state.tasks = updatedTasks;
            updateCellsPhaseId(state.cells as any, updatedTasks);
          }),
        ),

      updateCellOutputs: (cellId: string, outputs: OutputItem[]) => {
        updateCellOutputsHelper(set, get, cellId, outputs);
      },

      moveCellToIndex: (fromIndex: number, toIndex: number) => {
        set(
          produce((state: NotebookStoreState) => {
            const len = state.cells.length;
            if (len === 0) return;
            if (fromIndex < 0 || fromIndex >= len) return;

            // 允许移动到末尾（toIndex == len）
            let target = Math.max(0, Math.min(toIndex, len));
            if (fromIndex === target || fromIndex === target - 1) return;

            const [movedCell] = state.cells.splice(fromIndex, 1);
            // 若 target 等于当前长度，splice 的第二步插入到尾部
            state.cells.splice(target > state.cells.length ? state.cells.length : target, 0, movedCell);

            notebookLog.cellOperation('move', 'batch', {
              from: fromIndex,
              to: toIndex,
              cellId: movedCell.id,
              totalCells: state.cells.length,
            });
          }),
          false,
        );
      },

      setViewMode: (mode: ViewMode) =>
        set(
          produce((state: NotebookStoreState) => {
            state.viewMode = mode;
            if ((mode === 'step' || mode === 'demo') && state.tasks.length > 0) {
              if (!state.currentPhaseId) {
                const firstTask = state.tasks[0];
                if (firstTask?.phases?.length > 0) {
                  state.currentPhaseId = firstTask.phases[0].id;
                  state.currentStepIndex = 0;
                }
              } else {
                const phase = state.tasks.flatMap((t) => t.phases).find((p) => p.id === state.currentPhaseId);
                const stepsLen = phase?.steps?.length || 0;
                if (stepsLen === 0 || state.currentStepIndex >= stepsLen || state.currentStepIndex < 0) {
                  state.currentStepIndex = 0;
                }
              }
            }
          }),
        ),

      toggleViewMode: () =>
        set(
          produce((state: NotebookStoreState) => {
            state.viewMode = state.viewMode === 'create' ? 'step' : 'create';
            if (state.viewMode === 'step' && !state.currentPhaseId && state.tasks.length > 0) {
              const firstTask = state.tasks[0];
              if (firstTask?.phases?.length > 0) {
                state.currentPhaseId = firstTask.phases[0].id;
                state.currentStepIndex = 0;
              }
            }
          }),
        ),

      runSingleCell: async (cellId: string): Promise<RunResult> => {
        const { notebookId } = get();
        if (!notebookId) {
          showToast({ message: '未找到笔记本 ID', type: 'error' });
          return { success: false, error: 'Notebook ID not found' };
        }
        const result = await useCodeStore.getState().executeCell(cellId);
        if (!result.success) {
          showToast({ message: `单元格 ${cellId} 执行失败: ${result.error}`, type: 'error' });
        }
        return result;
      },

      runAllCells: async (): Promise<void> => {
        const state = get();
        const { notebookId } = state;

        if (!notebookId) {
          showToast({ message: '未找到笔记本 ID', type: 'error' });
          return;
        }

        set({ isExecuting: true, currentRunningPhaseId: null });

        try {
          get().clearAllOutputs();

          const tasks = parseMarkdownCells(state.cells as any) as any;
          updateCellsPhaseId(state.cells as any, tasks);
          set({ tasks });

          const codeCells = state.cells.filter((cell) => cell.type === 'code');

          for (const cell of codeCells) {
            const phase = tasks.flatMap((t: any) => t.phases).find((p: any) => p.id === cell.phaseId);
            if (phase && phase.id !== state.currentRunningPhaseId) {
              set({ currentRunningPhaseId: phase.id });
            }

            const result = await get().runSingleCell(cell.id);
            if (!result.success) break;
          }
        } finally {
          set({ isExecuting: false, currentRunningPhaseId: null });
        }
      },

      runCurrentCodeCell: async (): Promise<void> => {
        const state = get();
        const currentCellId = state.currentCellId;
        if (!currentCellId) {
          showToast({ message: '当前没有选中的单元格', type: 'error' });
          return;
        }
        const currentCell = state.cells.find((c) => c.id === currentCellId);
        if (!currentCell) {
          showToast({ message: '找不到当前选中的单元格', type: 'error' });
          return;
        }
        if (currentCell.type !== 'code') {
          showToast({ message: '当前选中的单元格不是代码单元格', type: 'error' });
          return;
        }
        await get().runSingleCell(currentCellId);
      },

      addNewCell2End: (type: CellType, description: string = '', enableEdit: boolean = true): string => {
        const id = uuidv4();
        const newCell: Partial<Cell> = {
          id,
          type,
          content: '',
          outputs: [],
          enableEdit,
          phaseId: get().currentRunningPhaseId || null,
          description,
        };
        get().addCell(newCell);
        set({ lastAddedCellId: id });
        if (enableEdit) set({ editingCellId: id });
        set({ currentCellId: id });

        const state = get();
        if (!state.currentPhaseId) {
          const firstPhase = state.tasks[0]?.phases[0];
          if (firstPhase) set({ currentPhaseId: firstPhase.id, currentStepIndex: 0 });
        }

        showToast({ message: `新建 ${type} 单元格已添加`, type: 'success' });
        return id;
      },

      addNewCellWithUniqueIdentifier: (
        type: CellType,
        description: string = '',
        enableEdit: boolean = true,
        uniqueIdentifier?: string,
        prompt?: string,
      ): string => {
        const timestamp = Date.now();
        const identifier =
          uniqueIdentifier ||
          (() => {
            let id = `gen-${timestamp}`;
            if (prompt) {
              const promptHash = prompt.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              id += `-${promptHash}`;
            }
            return id;
          })();

        const id = uuidv4();
        const newCell: Partial<Cell> = {
          id,
          type,
          content: '',
          outputs: [],
          enableEdit,
          phaseId: get().currentRunningPhaseId || null,
          description,
          metadata: {
            uniqueIdentifier: identifier,
            generationTimestamp: timestamp,
            prompt: prompt || undefined,
            isGenerating: true,
            generationType: type === 'image' ? 'image' : undefined,
          },
        };

        get().addCell(newCell);
        set({ lastAddedCellId: id });
        if (enableEdit) set({ editingCellId: id });
        set({ currentCellId: id });

        const state = get();
        if (!state.currentPhaseId) {
          const firstPhase = state.tasks[0]?.phases[0];
          if (firstPhase) set({ currentPhaseId: firstPhase.id, currentStepIndex: 0 });
        }

        showToast({ message: `新建 ${type} 单元格已添加`, type: 'success' });
        return id;
      },

      updateCellByUniqueIdentifier: (uniqueIdentifier: string, updates: Partial<Cell>): boolean => {
        const state = get();
        const targetCell = state.cells.find((cell) => cell.metadata?.uniqueIdentifier === uniqueIdentifier);

        if (!targetCell) {
          notebookLog.warn('Cell not found', { uniqueIdentifier });
          return false;
        }

        // 合并 metadata
        const mergedMeta = updates.metadata
          ? { ...(targetCell.metadata || {}), ...updates.metadata }
          : targetCell.metadata;

        if (updates.content !== undefined) get().updateCell(targetCell.id, updates.content);
        if (mergedMeta) get().updateCellMetadata(targetCell.id, mergedMeta);

        return true;
      },

      addNewCell2Next: (type: CellType, description: string = '', enableEdit: boolean = true) => {
        const id = uuidv4();
        const newCell: Partial<Cell> = {
          id,
          type,
          content: '',
          outputs: [],
          enableEdit,
          phaseId: get().currentRunningPhaseId || null,
          description,
        };

        const currentIdx = get().cells.findIndex((c) => c.id === get().currentCellId);
        const insertIndex = currentIdx >= 0 ? currentIdx + 1 : undefined; // 若没有当前 cell，末尾插入
        get().addCell(newCell, insertIndex);
        set({ lastAddedCellId: id, editingCellId: id, currentCellId: id });

        const state = get();
        if (!state.currentPhaseId) {
          const firstPhase = state.tasks[0]?.phases[0];
          if (firstPhase) set({ currentPhaseId: firstPhase.id, currentStepIndex: 0 });
        }

        showToast({ message: `新建 ${type} 单元格已添加`, type: 'success' });
      },

      addNewContent2CurrentCell: (content: string) => {
        const currentCellId = get().currentCellId;
        if (!currentCellId) {
          showToast({ message: '当前没有选中的单元格', type: 'error' });
          return;
        }
        const currentCell = get().cells.find((c) => c.id === currentCellId);
        if (!currentCell) {
          showToast({ message: '找不到当前选中的单元格', type: 'error' });
          return;
        }
        const updatedContent = `${currentCell.content}${content}`;
        get().updateCell(currentCellId, updatedContent);
        showToast({ message: `内容已添加到单元格 ${currentCellId}`, type: 'success' });
      },

      getCurrentCellType: (): CellType => {
        const state = get();
        const currentCell = state.cells.find((c) => c.id === state.currentCellId);
        return currentCell ? currentCell.type : 'markdown';
      },

      checkOutputsIsError: (outputs: OutputItem[]): boolean => outputs.some((o) => o.type === 'error'),

      checkCurrentCodeCellOutputsIsError: (): boolean => {
        const currentCell = get().getCurrentCell();
        if (!currentCell) {
          notebookLog.warn('No current cell found - cannot check code cell outputs');
          return false;
        }
        if (currentCell.type !== 'code') {
          notebookLog.warn('Current cell is not a code cell - cannot check outputs');
          return false;
        }
        return (currentCell.outputs || []).some((o) => o.type === 'error');
      },

      updateCellCanEdit: (cellId: string, isEditable: boolean) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === cellId);
            if (cell) cell.enableEdit = isEditable;
          }),
        ),

      updateCellMetadata: (cellId: string, metadata: Record<string, any>) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === cellId);
            if (cell) {
              cell.metadata = { ...(cell.metadata || {}), ...metadata };
            }
          }),
        ),

      convertCurrentCodeCellToHybridCell: () =>
        set(
          produce((state: NotebookStoreState) => {
            const currentCell = state.cells.find((c) => c.id === state.currentCellId);
            if (!currentCell) {
              notebookLog.warn('No current cell found - cannot convert to Hybrid cell');
              return;
            }
            currentCell.type = 'hybrid';
          }),
        ),

      convertToCodeCell: (cellId: string) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === cellId);
            if (!cell) return;

            const lines = cell.content.split('\n');
            const codeFence = /^```(\w+)?$/;

            for (let i = 0; i < lines.length; i++) {
              if (codeFence.test(lines[i].trim())) {
                let codeContent = '';
                let j = i + 1;
                while (j < lines.length && !codeFence.test(lines[j].trim())) {
                  codeContent += lines[j] + '\n';
                  j++;
                }
                cell.type = 'code';
                cell.content = codeContent.trim();
                break;
              }
            }

            const updatedTasks = parseMarkdownCells(state.cells as any) as any;
            updateCellsPhaseId(state.cells as any, updatedTasks);
            state.tasks = updatedTasks;
          }),
        ),

      updateCellType: (cellId: string, newType: CellType) =>
        set(
          produce((state: NotebookStoreState) => {
            const cell = state.cells.find((c) => c.id === cellId);
            if (cell) {
              cell.type = newType;
              const updatedTasks = parseMarkdownCells(state.cells as any) as any;
              updateCellsPhaseId(state.cells as any, updatedTasks);
              state.tasks = updatedTasks;
            }
          }),
        ),

      getHistoryCode: (): string => {
        const state = get();
        if (!state.currentCellId || !Array.isArray(state.cells)) return '';
        const currentIndex = state.cells.findIndex((c) => c.id === state.currentCellId);
        if (currentIndex <= 0) return '';
        // 取当前 cell 之前的所有 code cell
        const before = state.cells.slice(0, currentIndex).filter((c) => c.type === 'code');
        return before.map((c) => c.content).join('\n');
      },

      getPhaseHistoryCode: (phaseId: string): string => {
        const state = get();
        if (!state.currentCellId || !Array.isArray(state.cells)) return '';
        const currentIndex = state.cells.findIndex((c) => c.id === state.currentCellId);
        if (currentIndex <= 0) return '';
        const before = state.cells
          .slice(0, currentIndex)
          .filter((c) => c.type === 'code' && c.phaseId === phaseId);
        return before.map((c) => c.content).join('\n');
      },

      getPhaseById: (phaseId: string): Phase | null => {
        const state = get();
        return state.tasks.flatMap((t) => t.phases).find((p) => p.id === phaseId) || null;
      },

      getTaskByPhaseId: (phaseId: string): Task | null => {
        const state = get();
        return state.tasks.find((t) => t.phases.some((p) => p.id === phaseId)) || null;
      },

      getCurrentViewCells: (): Cell[] => {
        const state = get();

        if (!Array.isArray(state.cells)) {
          console.error('state.cells is not an array:', state.cells);
          return [];
        }

        let cells: Cell[];

        if (state.viewMode === 'create' || !state.currentPhaseId) {
          cells = state.cells;
        } else {
          const phase = get().getPhaseById(state.currentPhaseId);
          if (!phase || !phase.steps.length) {
            const phaseResult = findCellsByPhase(state.tasks as any, state.currentPhaseId);
            const merged: Cell[] = [...phaseResult.intro];
            phaseResult.steps.forEach((s) => {
              if (Array.isArray(s.content)) merged.push(...s.content);
            });
            cells = merged;
          } else {
            const currentStep = phase.steps[state.currentStepIndex];
            if (!currentStep) return [];
            cells = findCellsByStep(
              state.tasks as any,
              state.currentPhaseId,
              currentStep.id,
              state.cells as any,
            );
          }
        }

        if (!Array.isArray(cells)) {
          notebookLog.error('getCurrentViewCells: cells is not an array', { cells });
          return [];
        }

        return cells.map((cell) => ({
          ...cell,
          outputs: Array.isArray(cell.outputs) ? cell.outputs.map(deserializeOutput) : [],
        }));
      },

      getCurrentStepCellsIDs: (): string[] => {
        const state = get();
        const phase = get().getPhaseById(state.currentPhaseId!);
        if (!phase || !phase.steps.length) return [];
        const currentStep = phase.steps[state.currentStepIndex];
        if (!currentStep) return [];
        return findCellsByStep(
          state.tasks as any,
          state.currentPhaseId!,
          currentStep.id,
          state.cells as any,
        ).map((c) => c.id);
      },

      getAllCellsBeforeCurrent: (): Cell[] => {
        const state = get();
        const { cells, currentCellId } = state;
        if (!currentCellId || !Array.isArray(cells)) return [];
        const currentIndex = cells.findIndex((cell) => cell.id === currentCellId);
        if (currentIndex === -1) return [];
        return cells.slice(0, currentIndex).map((cell) => ({
          ...cell,
          outputs: Array.isArray(cell.outputs) ? cell.outputs.map(deserializeOutput) : [],
        }));
      },

      getTotalSteps: (): number => {
        const state = get();
        const phase = get().getPhaseById(state.currentPhaseId!);
        return phase ? phase.steps.length : 0;
      },

      // 独立窗口管理
      setDetachedCellId: (cellId: string | null) =>
        set({ detachedCellId: cellId, isDetachedCellFullscreen: false }),
      getDetachedCell: (): Cell | null => {
        const state = get();
        if (!state.detachedCellId) return null;
        return state.cells.find((c) => c.id === state.detachedCellId) || null;
        },
      toggleDetachedCellFullscreen: () =>
        set((state) => ({ isDetachedCellFullscreen: !state.isDetachedCellFullscreen })),

      // 自动保存
      triggerAutoSave: () => {
        const state = get();
        if (!state.notebookId) {
          storeLog.debug('Auto-save skipped: no notebookId');
          return;
        }
        if (!state.isInitialized) {
          storeLog.debug('Auto-save skipped: notebook not initialized', {
            notebookId: state.notebookId,
            cellsCount: state.cells?.length || 0,
            isInitialized: state.isInitialized,
          });
          return;
        }

        notebookAutoSaveInstance
          .queueSave({
            notebookId: state.notebookId,
            notebookTitle: state.notebookTitle,
            cells: state.cells,
            tasks: state.tasks,
            timestamp: Date.now(),
          })
          .catch((error) => {
            storeLog.error('Failed to queue save', { error });
          });
      },

      loadFromDatabase: async (notebookId: string): Promise<boolean> => {
        try {
          notebookLog.lifecycleEvent('load', notebookId, { source: 'database' });

          const result = await NotebookAutoSave.loadNotebook(notebookId);
          if (!result) {
            notebookLog.warn('Notebook not found in database', { notebookId });
            return false;
          }

          const { notebookTitle, cells, tasks } = result;
          notebookLog.info('Loaded notebook data', {
            title: notebookTitle,
            cellsCount: cells.length,
            tasksCount: tasks.length,
          });

          // 清空当前状态
          set({
            cells: [],
            tasks: [],
            currentRunningPhaseId: null,
            currentPhaseId: null,
            currentStepIndex: 0,
            error: null,
          });

          // 基本信息
          set({
            notebookId,
            notebookTitle,
            viewMode: 'create',
          });

          // 直接设置 cells
          if (cells && cells.length > 0) {
            set({ cells: [...cells] });
            notebookLog.cellOperation('update', 'batch', { count: cells.length });
          } else {
            const defaultCell: Cell = {
              id: `title-${Date.now()}`,
              type: 'markdown',
              content: `# ${notebookTitle}`,
              outputs: [],
              enableEdit: true,
              phaseId: null,
              description: null,
              metadata: { isDefaultTitle: true },
            };
            set({ cells: [defaultCell] });
            notebookLog.cellOperation('create', 'title', { reason: 'default creation' });
          }

          // tasks 与 phase 初始化
          if (tasks && tasks.length > 0) {
            set({
              tasks,
              currentPhaseId: tasks[0]?.phases?.[0]?.id || null,
            });
          }

          // 设置当前 cell
          const finalCells = get().cells;
          if (finalCells.length > 0) {
            set({ currentCellId: finalCells[0].id });
          }

          notebookLog.lifecycleEvent('load', notebookId, {
            status: 'success',
            cellCount: finalCells.length,
          });

          showToast({ message: `已加载笔记本: ${notebookTitle}`, type: 'success' });
          return true;
        } catch (error) {
          notebookLog.error('Failed to load notebook', { notebookId, error });
          showToast({ message: `加载笔记本失败: ${String(error)}`, type: 'error' });
          return false;
        }
      },

      saveNow: async (): Promise<void> => {
        const state = get();
        if (!state.notebookId) return;

        try {
          await notebookAutoSaveInstance.saveNow({
            notebookId: state.notebookId,
            notebookTitle: state.notebookTitle,
            cells: state.cells,
            tasks: state.tasks,
            timestamp: Date.now(),
          });

          showToast({ message: '笔记本已保存', type: 'success' });
        } catch (error) {
          notebookLog.error('Failed to save notebook', { error });
          showToast({ message: `保存失败: ${String(error)}`, type: 'error' });
        }
      },
    };
  }),
);

/* ------------------------- 自动保存订阅 ------------------------- */
useStore.subscribe(
  (state) => ({
    notebookId: state.notebookId,
    notebookTitle: state.notebookTitle,
    cells: state.cells,
    tasks: state.tasks,
  }),
  async (current, previous) => {
    if (!current.notebookId) return;
    // 初次绑定不触发
    if (!previous.notebookId && current.notebookId) return;

    const hasChanges =
      current.notebookTitle !== previous.notebookTitle ||
      current.cells.length !== previous.cells.length ||
      current.tasks.length !== previous.tasks.length ||
      JSON.stringify(current.cells) !== JSON.stringify(previous.cells) ||
      JSON.stringify(current.tasks) !== JSON.stringify(previous.tasks);

    if (hasChanges) {
      notebookLog.info('Notebook content changed - triggering auto-save');
      try {
        await notebookAutoSaveInstance.initialize();
        await notebookAutoSaveInstance.queueSave({
          notebookId: current.notebookId,
          notebookTitle: current.notebookTitle,
          cells: current.cells,
          tasks: current.tasks,
          timestamp: Date.now(),
        });
      } catch (error) {
        notebookLog.error('Auto-save failed', { error });
      }
    }
  },
);

export default useStore;