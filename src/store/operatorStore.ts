import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { OperationService } from '@Services/notebook/OperationService';
import { handleStreamResponse } from '@Services/stream';
import { showToast } from '@/components/UI/Toast';
import useCodeStore from '@Store/codeStore';
import useNotebookStore from '@Store/notebookStore';
import { storeLog } from '@Utils/logger';
import { OperationDispatcher } from '@Services/stream/OperationDispatcher';
import type { StreamData } from '@Services/stream';
import type {
  Operation,
  OperationResponseData,
  OperationSubmission,
} from '@Store/models/operation';

/**
 * 流处理回调函数类型
 */
export type StreamDataCallback = (data: OperationResponseData) => Promise<void>;

/**
 * Toast 显示函数类型
 */
export type ToastFunction = (message: {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}) => void;

/**
 * Operator Store 状态接口
 */
export interface OperatorStoreState {
  operations: Operation[];
  operationResponses: Record<string, OperationResponseData[]>;
  isSendingOperation: boolean;
  error: string | null;
}

/**
 * Operator Store Actions 接口
 */
export interface OperatorStoreActions {
  addOperation: (operation: Operation) => string;
  submitOperation: (
    notebookId: string | null,
    operation: Operation,
    admissionSignal?: AbortSignal
  ) => Promise<OperationSubmission>;
  sendOperation: (notebookId: string | null, operation: Operation) => Promise<void>;
  getOperationHistory: () => Operation[];
  getOperationResponses: (operationId: string) => OperationResponseData[];
  clearOperations: () => void;
  resetError: () => void;
}

/**
 * 完整的 Operator Store 类型
 */
export type OperatorStore = OperatorStoreState & OperatorStoreActions;

const useOperatorStore = create<OperatorStore>((set, get) => {
  const dispatcher = new OperationDispatcher({
    initialize: () => useCodeStore.getState().initializeKernel(),
    open: (notebookId, operation, signal) =>
      OperationService.sendOperation(notebookId, operation, signal),
    record: (operation) => get().addOperation(operation),
    receive: async (operationId, data, signal) => {
      if (signal.aborted) return;
      set((state) => ({
        operationResponses: {
          ...state.operationResponses,
          [operationId]: [...(state.operationResponses[operationId] || []), data],
        },
      }));
      if (signal.aborted) return;
      await handleStreamResponse(
        data as unknown as StreamData,
        async (toast) => {
          showToast({
            description: toast.message,
            variant: toast.type === 'error' ? 'destructive' : 'default',
          });
        },
        signal
      );
    },
    busy: (value) =>
      set(value ? { isSendingOperation: true, error: null } : { isSendingOperation: false }),
    error: (message) => {
      storeLog.error('Operation failed', { error: message });
      set({ error: message });
      showToast({ description: `操作发送失败: ${message}`, variant: 'destructive' });
    },
    refused: (message) => showToast({ description: message, variant: 'default' }),
  });
  useNotebookStore.subscribe((state, previous) =>
    dispatcher.notebookChanged(previous.notebookId, state.notebookId)
  );
  return {
    operations: [],
    operationResponses: {},
    isSendingOperation: false,
    error: null,

    addOperation: (operation: Operation): string => {
      const newOperation: Operation = {
        ...operation,
        id: uuidv4(),
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        operations: [...state.operations, newOperation],
      }));
      return newOperation.id!;
    },

    /**
     * 发送操作到后端
     * @param notebookId - 笔记本ID
     * @param operation - 操作对象
     */
    submitOperation: (notebookId, operation, admissionSignal) =>
      dispatcher.submit(notebookId, operation, admissionSignal),

    sendOperation: async (notebookId: string | null, operation: Operation): Promise<void> => {
      const result = await dispatcher.submit(notebookId, operation);
      if (result.accepted) await result.completion;
    },

    /**
     * 获取操作历史
     */
    getOperationHistory: (): Operation[] => get().operations,

    /**
     * 获取某个操作的响应记录
     * @param operationId - 操作ID
     */
    getOperationResponses: (operationId: string): OperationResponseData[] =>
      get().operationResponses[operationId] || [],

    /**
     * 清空操作历史和响应记录
     */
    clearOperations: () => set({ operations: [], operationResponses: {} }),

    /**
     * 重置错误状态
     */
    resetError: () => set({ error: null }),
  };
});

export default useOperatorStore;
