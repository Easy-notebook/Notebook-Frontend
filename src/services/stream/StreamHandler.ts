/**
 * Stream Handler - Main orchestrator for handling stream responses
 *
 * Refactored from streamHandler.ts using OOP and action pattern
 */

import { describeError } from '@Utils/errors';
import { getStreamActionClass } from './actions';
import type { StreamData, ShowToastFunction, StreamActionContext } from './types';
import { agentLog, networkLog } from '@Utils/logger';

export class StreamHandler {
  private static instance: StreamHandler;

  private constructor() {}

  static getInstance(): StreamHandler {
    if (!StreamHandler.instance) {
      StreamHandler.instance = new StreamHandler();
    }
    return StreamHandler.instance;
  }

  /**
   * Handle a stream response by dispatching to the appropriate action
   */
  async handleStream(
    data: StreamData,
    showToast: ShowToastFunction,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted();
    const notify: ShowToastFunction = async (toast) => {
      signal?.throwIfAborted();
      await showToast(toast);
      signal?.throwIfAborted();
    };
    // Normalize payload: handle both direct payload and data.payload formats
    const payload = data.payload || data.data?.payload || {};
    const dataPayload = data.data || { payload };

    console.log('[DEBUG] StreamHandler - Received stream data:', {
      type: data.type,
      payload,
      rawData: data,
    });

    // Create normalized data object
    const normalizedData: StreamData = {
      ...data,
      payload: payload,
      data: dataPayload,
    };

    // Create action context
    const context: StreamActionContext = {
      data: normalizedData,
      payload: payload,
      showToast: notify,
      signal,
    };

    // Try to find and execute registered action
    const ActionClass = getStreamActionClass(data.type);

    if (ActionClass) {
      try {
        const action = new ActionClass();
        await action.execute(context);
        signal?.throwIfAborted();
        agentLog.debug('Stream action executed successfully', { type: data.type });

        // Record significant stream actions to AI Agent Store
        // Filter out high-frequency events to avoid noise
        if (data.type !== 'addContentToAnswer') {
          const { useAIAgentStore } = await import('@Store/AIAgentStore');
          signal?.throwIfAborted();
          useAIAgentStore.getState().addAction({
            type: 'system_event',
            content: `Stream Update: ${data.type}`,
            result: JSON.stringify(payload, null, 2),
            onProcess: false,
            relatedQAIds: [],
            cellId: null,
            viewMode: 'script' as any, // Default to script view or cast to any
          });
        }
      } catch (error) {
        signal?.throwIfAborted();
        agentLog.error('Stream action execution failed', { type: data.type, error });
        await notify({
          message: `处理流式响应失败: ${describeError(error)}`,
          type: 'error',
        });
      }
    } else {
      // No registered action found, log warning
      networkLog.warn('Unhandled stream response type', { type: data.type, data });
      console.log(data);
      console.warn('未处理的流式响应类型:', data.type);
    }
  }
}

/**
 * Main export function for backward compatibility
 */
export const handleStreamResponse = async (
  data: StreamData,
  showToast: ShowToastFunction,
  signal?: AbortSignal
): Promise<void> => {
  const handler = StreamHandler.getInstance();
  await handler.handleStream(data, showToast, signal);
};

// Re-export types for convenience
export type { StreamData, ShowToastFunction, StreamActionContext } from './types';
