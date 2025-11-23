import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { OperationService } from '@Services/notebook/OperationService';
import { handleStreamResponse } from '@Services/stream';
import { showToast } from '@/components/UI/Toast';
import useCodeStore from '@Store/codeStore';
import { storeLog } from '@Utils/logger';
import { apiLog } from '@Utils/logger';
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
    const state = get();

    if (!notebookId) {
      const kernelId = await useCodeStore.getState().initializeKernel();
      if (!kernelId) {
        showToast({
          description: '无法初始化内核',
          variant: 'destructive',
        });
        return;
      }
      notebookId = kernelId;
    }

    if (state.isSendingOperation) {
      showToast({
        description: '正在处理其他操作，请稍后...',
        variant: 'default',
      });
      return;
    }

    set({ isSendingOperation: true, error: null });
    const operationId = get().addOperation(operation);

    try {
      storeLog.debug('Sending operation', {
        operationId,
        operationType: operation.type,
        notebookId,
      });

      // Use OperationService to send operation
      const stream = await OperationService.sendOperation(notebookId, operation);
      if (!stream) return;

      const reader = stream.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const readStream = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          apiLog.debug('Stream closed');
          if (buffer.trim()) {
            processBuffer();
          }
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        processBuffer();
        readStream();
      };

      const processBuffer = () => {
        let depth = 0;
        let start = 0;
        let inString = false;
        let escape = false;

        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === '\\') {
            escape = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              const jsonStr = buffer.substring(start, i + 1);
              try {
                const data = JSON.parse(jsonStr) as OperationResponseData;
                apiLog.debug('Received stream update', {
                  operationId,
                  dataType: data.type,
                  hasPayload: !!data.payload,
                });

                // Handle stream response (cast to StreamData as they're compatible)
                // Wrap showToast to match expected signature
                const toastWrapper = async (toast: {
                  message: string;
                  type: 'success' | 'error' | 'warning' | 'info';
                }) => {
                  showToast({
                    description: toast.message,
                    variant: toast.type === 'error' ? 'destructive' : 'default',
                  });
                };
                handleStreamResponse(data as any, toastWrapper);

                // Update operation responses
                set((state) => ({
                  operationResponses: {
                    ...state.operationResponses,
                    [operationId]: [...(state.operationResponses[operationId] || []), data],
                  },
                }));
              } catch (e) {
                apiLog.error('Failed to parse JSON', { error: e, json: jsonStr.substring(0, 100) });
              }
              start = i + 1;
            }
          }
        }
        buffer = buffer.substring(start);
      };

      await readStream();
      storeLog.debug('Operation completed', { operationId });
    } catch (error: any) {
      storeLog.error('Failed to send operation', {
        error: error.message,
        operationType: operation.type,
        notebookId,
      });
      set({ error: error.message });
      showToast({
        description: `操作发送失败: ${error.message}`,
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
