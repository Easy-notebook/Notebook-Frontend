import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { OperationService } from '@Services/notebook/OperationService';
import { handleStreamResponse } from '@Services/stream';
import { showToast } from '@/components/UI/Toast';
import useCodeStore from '@Store/codeStore';
import { storeLog } from '@Utils/logger';
import { OperationStreamReader } from '@Services/stream/OperationStreamReader';
import type { StreamData } from '@Services/stream';
import type { Operation, OperationResponseData } from '@Store/models/operation';

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

const useOperatorStore = create<OperatorStore>((set, get) => ({
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
  sendOperation: async (notebookId: string | null, operation: Operation): Promise<void> => {
    if (get().isSendingOperation) {
      showToast({ description: '正在处理其他操作，请稍后...', variant: 'default' });
      return;
    }
    // Reserve before kernel initialization: concurrent requests must not both pass admission.
    set({ isSendingOperation: true, error: null });
    try {
      if (!notebookId) {
        const kernelId = await useCodeStore.getState().initializeKernel();
        if (!kernelId) throw new Error('无法初始化内核');
        notebookId = kernelId;
      }
      const operationId = get().addOperation(operation);
      storeLog.debug('Sending operation', {
        operationId,
        operationType: operation.type,
        notebookId,
      });

      const stream = await OperationService.sendOperation(notebookId, operation);
      if (!stream) throw new Error('Operation response has no stream body');
      await new OperationStreamReader().consume(stream, async (data) => {
        set((state) => ({
          operationResponses: {
            ...state.operationResponses,
            [operationId]: [...(state.operationResponses[operationId] || []), data],
          },
        }));
        await handleStreamResponse(data as unknown as StreamData, async (toast) => {
          showToast({
            description: toast.message,
            variant: toast.type === 'error' ? 'destructive' : 'default',
          });
        });
      });

      storeLog.debug('Operation completed', { operationId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      storeLog.error('Failed to send operation', {
        error: message,
        operationType: operation.type,
        notebookId,
      });
      set({ error: message });
      showToast({
        description: `操作发送失败: ${message}`,
        variant: 'destructive',
      });
    } finally {
      set({ isSendingOperation: false });
    }
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
}));

export default useOperatorStore;
