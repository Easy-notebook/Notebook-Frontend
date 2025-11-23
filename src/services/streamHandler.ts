// services/streamHandler.ts
import globalUpdateInterface from '../interfaces/globalUpdateInterface';
import useStore from '@Store/notebookStore';
import { agentLog, networkLog, uiLog } from '@Utils/logger';
import { AgentMemoryService, AgentType } from './agentMemoryService';
// 跟踪正在生成的 cells 的映射表
const generationCellTracker = new Map<string, string>(); // commandId -> cellId

// 跟踪当前流式 QA 的 ID（用于后端在 finish 阶段未返回 QId 的兜底）
let lastStreamingQaId: string | null = null;

// 视频生成轮询管理
const activeVideoPolls = new Map<string, number>();

// 视频生成状态轮询函数
const startVideoGenerationPolling = async (
  taskId: string,
  uniqueIdentifier: string,
  commandId?: string,
  prompt?: string
) => {
  // 清理可能存在的旧轮询
  if (activeVideoPolls.has(taskId)) {
    clearInterval(activeVideoPolls.get(taskId)!);
  }

  let attempts = 0;
  const maxAttempts = 60; // 最多轮询60次，每次10秒 = 10分钟

  const pollInterval = setInterval(async () => {
    try {
      attempts++;

      // 获取当前notebook状态
      const notebookState = useStore.getState();
      const notebookId = notebookState.notebookId;

      if (!notebookId) {
        networkLog.error('Unable to get notebookId - stopping poll', { taskId });
        clearInterval(pollInterval);
        activeVideoPolls.delete(taskId);
        return;
      }

      // 发送状态查询请求到后端
      const { default: useOperatorStore } = await import('../store/operatorStore');
      const statusCommand = {
        type: 'check_video_generation_status',
        payload: {
          taskId: taskId,
          uniqueIdentifier: uniqueIdentifier,
          commandId: commandId,
        },
      };

      useOperatorStore.getState().sendOperation(notebookId, statusCommand);

      // 检查是否超时
      if (attempts >= maxAttempts) {
        networkLog.warn('Video generation poll timeout', { taskId, attempts });
        clearInterval(pollInterval);
        activeVideoPolls.delete(taskId);

        // 更新cell状态为超时
        const success = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
          metadata: {
            isGenerating: false,
            generationError: 'Generation timeout',
            generationStatus: 'timeout',
          },
        });

        if (success) {
          agentLog.info('Video generation timeout status updated', { taskId });
        }
      }
    } catch (error) {
      networkLog.error('Video generation status poll error', { taskId, error });
      clearInterval(pollInterval);
      activeVideoPolls.delete(taskId);
    }
  }, 10000); // 每10秒轮询一次

  activeVideoPolls.set(taskId, pollInterval);
  networkLog.info('Video generation status polling started', { taskId, uniqueIdentifier });
};

// Normalize incoming cell type to store-supported types
const normalizeCellTypeForStore = (
  t: string | undefined | null
): 'code' | 'markdown' | 'hybrid' | 'image' | 'link' => {
  if (!t) return 'markdown';
  if (t === 'Hybrid') return 'hybrid';
  if (t === 'image') return 'image';
  if (t === 'video') return 'image';
  if (t === 'thinking') return 'markdown';
  if (t === 'link') return 'link';
  return (t as any) === 'code' ||
    (t as any) === 'markdown' ||
    (t as any) === 'hybrid' ||
    (t as any) === 'image' ||
    (t as any) === 'link'
    ? (t as any)
    : 'markdown';
};

// Type definitions for stream data structures
export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface StreamPayload {
  mode?: 'create' | 'step';
  phaseId?: string;
  index?: number;
  allow?: boolean;
  cellId?: string;
  content?: string;
  outputs?: any[];
  cell?: any;
  error?: string;
  type?: string;
  description?: string;
  QId?: string | number;
  // Optional fields used across various stream events
  metadata?: any;
  commandId?: string;
  prompt?: string;
  uniqueIdentifier?: string;
  title?: string;
  variable_name?: string;
  default_value?: any;
  variable_value?: any;
  variable_type?: string;
  action?: string;
  event?: string;
  target_agent?: string;
  message?: string;
  help_request?: string;
}

export interface StreamData {
  type: string;
  payload?: StreamPayload;
  data?: {
    payload?: StreamPayload;
  };
}

export interface GlobalUpdateInterface {
  setViewMode: (mode: 'create' | 'step' | string) => Promise<void>;
  setCurrentPhase: (phaseId: string) => Promise<void>;
  setCurrentStepIndex: (index: number) => Promise<void>;
  setAllowPagination: (allow: boolean) => Promise<void>;
  updateCell: (cellId: string, content: string) => Promise<void>;
  updateCellOutputs: (cellId: string, outputs: any[]) => Promise<void>;
  addCell: (cell: any, index?: number) => Promise<void>;
  deleteCell: (cellId: string) => Promise<void>;
  setError: (error: string) => Promise<void>;
  clearCells: () => Promise<void>;
  clearCellOutputs: (cellId: string) => Promise<void>;
  clearAllOutputs: () => Promise<void>;
  setCurrentCell: (cellId: string) => Promise<void>;
  setCurrentRunningPhaseId: (phaseId: string) => Promise<void>;
  addNewCell2End: (
    type: 'code' | 'markdown' | 'hybrid' | 'Hybrid' | 'image' | 'video' | string,
    description: string,
    enableEdit?: boolean
  ) => Promise<string>;
  addNewContent2CurrentCell: (content: string) => Promise<void>;
  runCurrentCodeCell: () => Promise<void>;
  setCurrentCellMode_onlyCode: () => Promise<void>;
  setCurrentCellMode_onlyOutput: () => Promise<void>;
  setCurrentCellMode_complete: () => Promise<void>;
  initStreamingAnswer: (qid: string) => Promise<void>;
  addContentToAnswer: (qid: string, content: string) => Promise<void>;
  finishStreamingAnswer: (qid: string) => Promise<void>;
  addNewContent2CurrentCellDescription: (content: string) => Promise<void>;
  convertCurrentCodeCellToHybridCell: () => Promise<void>;
  updateCurrentCellWithContent: (content: string) => Promise<void>;
  addNewCell2Next: (type: string, description: string) => Promise<void>;
  updateCellMetadata: (cellId: string, metadata: any) => Promise<void>;
  getAddedLastCellID: () => string;
}

export type ShowToastFunction = (toast: ToastMessage) => Promise<void>;

export const handleStreamResponse = async (
  data: StreamData,
  showToast: ShowToastFunction
): Promise<void> => {
  // Normalize payload: handle both direct payload and data.payload formats
  const payload = data.payload || data.data?.payload;
  const dataPayload = data.data || { payload };
  console.log('[DEBUG] streamHandler - Received stream data:', {
    type: data.type,
    payload,
    rawData: data,
  });

  // Create a normalized data object for processing
  const normalizedData: StreamData = {
    ...data,
    payload: payload,
    data: dataPayload,
  };

  switch (data.type) {
    case 'update_view_mode': {
      const mode = normalizedData.payload?.mode;
      if (mode) {
        await globalUpdateInterface.setViewMode(mode as any);
        await showToast({
          message: `切换到 ${mode === 'create' ? 'Create' : 'Step'} Mode 成功`,
          type: 'success',
        });
      }
      break;
    }

    case 'update_current_phase': {
      const phaseId = normalizedData.payload?.phaseId;
      if (phaseId) {
        await globalUpdateInterface.setCurrentPhase(phaseId);
        await globalUpdateInterface.setCurrentStepIndex(0);
        await showToast({
          message: '当前阶段已更新',
          type: 'success',
        });

        // 注意: phase 切换是 notebook 的内部操作,不应该显示在 QA 回答中
      }
      break;
    }

    case 'update_current_step_index': {
      const index = normalizedData.payload?.index;
      if (typeof index === 'number') {
        await globalUpdateInterface.setCurrentStepIndex(index);
        await showToast({
          message: '当前步骤已更新',
          type: 'success',
        });
      }
      break;
    }

    case 'update_allow_pagination': {
      const allow = normalizedData.payload?.allow;
      if (typeof allow === 'boolean') {
        await globalUpdateInterface.setAllowPagination(allow);
        await showToast({
          message: `翻页权限已 ${allow ? '启用' : '禁用'}`,
          type: 'success',
        });
      }
      break;
    }

    case 'update_cell': {
      const cellId = normalizedData.payload?.cellId;
      const content = normalizedData.payload?.content;
      const outputs = normalizedData.payload?.outputs;

      if (cellId) {
        if (content) {
          await globalUpdateInterface.updateCell(cellId, content);
        }
        if (outputs) {
          await globalUpdateInterface.updateCellOutputs(cellId, outputs);
        }
      }
      break;
    }

    case 'add_cell': {
      const cell = normalizedData.payload?.cell;
      const index = normalizedData.payload?.index;
      if (cell) {
        await globalUpdateInterface.addCell(cell, index);
      }
      break;
    }

    case 'delete_cell': {
      const cellId = normalizedData.payload?.cellId;
      if (cellId) {
        await globalUpdateInterface.deleteCell(cellId);
      }
      break;
    }

    case 'set_error': {
      const error = normalizedData.payload?.error;
      if (error) {
        await globalUpdateInterface.setError(error);

        // 记录失败的交互
        try {
          const notebookState = (window as any).__notebookStore?.getState?.();
          const notebookId = notebookState?.notebookId;

          if (notebookId) {
            agentLog.error('Recording agent error', { error });

            // 根据错误类型判断Agent类型（简单启发式方法）
            let agentType: AgentType = 'general';
            if (error.includes('command') || error.includes('code generation')) {
              agentType = 'command';
            } else if (error.includes('debug') || error.includes('修复')) {
              agentType = 'debug';
            } else if (error.includes('output') || error.includes('分析')) {
              agentType = 'output';
            }

            AgentMemoryService.recordOperationInteraction(notebookId, agentType, 'error', false, {
              error_message: error,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (recordError) {
          agentLog.error('Failed to record error interaction', { error: recordError });
        }
      }
      break;
    }

    // 处理通用错误事件（后端有时发送 type: 'error'）
    case 'error': {
      const errorMsg =
        (normalizedData.payload as any)?.error || (data as any)?.error || 'Unknown error';
      const commandId = (normalizedData.payload as any)?.commandId || (data as any)?.commandId;
      const uniqueIdentifier =
        (normalizedData.payload as any)?.uniqueIdentifier || (data as any)?.uniqueIdentifier;

      agentLog.error('Received error event', { errorMsg, commandId, uniqueIdentifier });

      // Try to attach error to the related generation cell metadata for UI display
      let updated = false;
      if (uniqueIdentifier) {
        updated = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
          metadata: { isGenerating: false, generationError: errorMsg, generationStatus: 'failed' },
        });
      }
      if (!updated && commandId && generationCellTracker.has(commandId)) {
        const targetId = generationCellTracker.get(commandId)!;
        useStore.getState().updateCellMetadata(targetId, {
          isGenerating: false,
          generationError: errorMsg,
          generationStatus: 'failed',
        });
        updated = true;
      }

      await showToast({ message: `Error: ${errorMsg}`, type: 'error' });
      break;
    }

    case 'clear_cells': {
      await globalUpdateInterface.clearCells();
      break;
    }

    case 'clear_outputs': {
      const cellId = normalizedData.payload?.cellId;
      if (cellId) {
        await globalUpdateInterface.clearCellOutputs(cellId);
      } else {
        await globalUpdateInterface.clearAllOutputs();
      }
      break;
    }

    case 'set_current_cell': {
      const cellId = normalizedData.payload?.cellId;
      if (cellId) {
        await globalUpdateInterface.setCurrentCell(cellId);
      }
      break;
    }

    case 'set_running_phase': {
      const phaseId = normalizedData.payload?.phaseId;
      if (phaseId) {
        await globalUpdateInterface.setCurrentRunningPhaseId(phaseId);
      }
      break;
    }

    case 'ok': {
      agentLog.info('Operation successful', { data });

      // 如果是网页生成成功，触发文件列表刷新
      if (
        normalizedData.data?.message?.includes('webpage generated') ||
        normalizedData.data?.path?.includes('.sandbox')
      ) {
        try {
          window.dispatchEvent(new CustomEvent('refreshFileList'));
          uiLog.info('Triggered file list refresh for webpage generation');
        } catch (refreshError) {
          uiLog.warn('Failed to trigger file list refresh', { error: refreshError });
        }
      }
      break;
    }

    case 'addCell2EndWithContent': {
      const cellType = normalizedData.data?.payload?.type;
      const description = normalizedData.data?.payload?.description;
      const content = normalizedData.data?.payload?.content;
      const metadata = normalizedData.data?.payload?.metadata || {};
      const commandId = normalizedData.data?.payload?.commandId;
      const prompt = normalizedData.data?.payload?.prompt;
      const serverUniqueIdentifier =
        (normalizedData.data as any)?.payload?.uniqueIdentifier || metadata?.uniqueIdentifier;

      console.log('🆕 [addCell2EndWithContent] 收到创建cell请求:', {
        cellType,
        description: description?.substring(0, 50),
        contentLength: content?.length,
        commandId,
        uniqueIdentifier: serverUniqueIdentifier,
        metadata,
      });

      let newCellId = null;
      if (cellType && description) {
        const enableEdit = !metadata?.isGenerating; // 如果正在生成，不启用编辑

        // 如果是图片或视频生成任务，使用唯一标识符策略
        if (
          (cellType === 'image' || cellType === 'video') &&
          metadata?.isGenerating &&
          (prompt || serverUniqueIdentifier)
        ) {
          // 优先使用服务端提供的唯一标识符，否则回退到本地生成
          const uniqueIdentifier =
            serverUniqueIdentifier ||
            `gen-${Date.now()}-${(prompt || '')
              .substring(0, 20)
              .replace(/[^a-zA-Z0-9]/g, '')
              .toLowerCase()}`;

          const normalizedType = normalizeCellTypeForStore(cellType);
          newCellId = useStore
            .getState()
            .addNewCellWithUniqueIdentifier(
              normalizedType,
              description,
              enableEdit,
              uniqueIdentifier,
              prompt
            );

          // 同时保持commandId映射作为备份
          if (commandId) {
            generationCellTracker.set(commandId, newCellId);
            // 还要存储uniqueIdentifier映射
            generationCellTracker.set(`unique-${uniqueIdentifier}`, newCellId);
            console.log('✅ [addCell2EndWithContent] 存储生成cell映射 (image/video):', {
              commandId: commandId,
              uniqueIdentifier: uniqueIdentifier,
              cellId: newCellId,
              trackerSize: generationCellTracker.size,
            });
          } else {
            console.warn('⚠️ [addCell2EndWithContent] 图片/视频cell但没有commandId!', {
              uniqueIdentifier,
              cellId: newCellId,
            });
          }
        } else {
          // 普通cell创建
          const normalizedType2 = normalizeCellTypeForStore(cellType);
          newCellId = await globalUpdateInterface.addNewCell2End(
            normalizedType2,
            description,
            enableEdit
          );

          // 如果这是一个生成任务且有 commandId，存储映射关系
          if (newCellId && commandId && metadata?.isGenerating) {
            generationCellTracker.set(commandId, newCellId);
            agentLog.debug('Storing cell mapping', { commandId, cellId: newCellId });
            console.log('✅ [addCell2EndWithContent] 存储生成cell映射 (普通):', {
              commandId,
              cellId: newCellId,
              cellType,
              trackerSize: generationCellTracker.size,
            });
          } else if (newCellId && commandId) {
            // 即使不是生成任务，也存储commandId映射，方便后续更新
            generationCellTracker.set(commandId, newCellId);
            console.log('✅ [addCell2EndWithContent] 存储普通cell映射:', {
              commandId,
              cellId: newCellId,
              cellType,
              trackerSize: generationCellTracker.size,
            });
          } else {
            console.warn('⚠️ [addCell2EndWithContent] 无法存储cell映射:', {
              newCellId,
              commandId,
              isGenerating: metadata?.isGenerating,
              cellType,
            });
          }
        }
      }
      if (content && newCellId) {
        // Sticky-aware: append to the cell's existing content instead of overwriting
        const target = useStore.getState().cells.find((c) => c.id === newCellId);
        const appended = `${target?.content || ''}${content}`;
        useStore.getState().updateCell(newCellId, appended);
        console.log('✅ [addCell2EndWithContent] 已设置初始内容:', {
          cellId: newCellId,
          contentLength: appended.length,
        });
      } else if (content) {
        console.error('❌ [addCell2EndWithContent] 有内容但newCellId为null:', {
          contentLength: content.length,
          cellType,
          description,
        });
      }

      // Handle metadata for the newly created cell
      if (metadata && newCellId) {
        // Update the cell's metadata in the store
        const cells = useStore.getState().cells;
        const targetCell = cells.find((cell) => cell.id === newCellId);

        if (targetCell) {
          // 使用专门的updateCellMetadata方法
          useStore.getState().updateCellMetadata(newCellId, metadata);
          console.log('✅ [addCell2EndWithContent] 已设置metadata:', {
            cellId: newCellId,
            metadata,
          });
        } else {
          console.error('❌ [addCell2EndWithContent] 找不到刚创建的cell:', {
            newCellId,
            cellsCount: cells.length,
          });
        }
      }

      console.log('📊 [addCell2EndWithContent] Cell创建完成，当前tracker状态:', {
        newCellId,
        commandId,
        uniqueIdentifier: serverUniqueIdentifier,
        trackerSize: generationCellTracker.size,
        trackerKeys: Array.from(generationCellTracker.keys()),
      });

      // 注意: 不要将 cell 操作添加到 QA 回答中
      // cell 操作应该直接作用于 notebook,而不是显示在右侧边栏的 QA 中
      break;
    }

    case 'addNewContent2CurrentCell': {
      agentLog.debug('Adding new chunk to current cell');
      const content = normalizedData.data?.payload?.content;
      if (content) {
        // 首选当前编辑单元；如无，则回退到最近一次创建且仍在流式的单元
        const state = useStore.getState();
        if (!state.currentCellId) {
          const streamingCandidate = [...state.cells]
            .reverse()
            .find((c) => (c.metadata as any)?.isStreaming === true);
          if (streamingCandidate) {
            state.setCurrentCell(streamingCandidate.id);
            state.setEditingCellId(streamingCandidate.id);
          }
        }
        await globalUpdateInterface.addNewContent2CurrentCell(content);
      }
      break;
    }

    case 'runCurrentCodeCell': {
      agentLog.info('Executing current code cell', { data });
      await globalUpdateInterface.runCurrentCodeCell();

      // 记录debug完成（如果这是debug flow的一部分）
      try {
        const notebookState = (window as any).__notebookStore?.getState?.();
        const notebookId = notebookState?.notebookId;

        if (notebookId) {
          // 检查是否是debug上下文中的代码运行
          const debugMemory: any = AgentMemoryService.getAgentMemory(
            notebookId,
            'debug' as AgentType
          );
          const currentContext = (debugMemory as any)?.current_context;

          if (currentContext && currentContext.interaction_status === 'in_progress') {
            agentLog.info('Debug completed - code fixed and executed');

            // 更新debug状态
            AgentMemoryService.updateCurrentContext(notebookId, 'debug' as AgentType, {
              interaction_status: 'completed',
              debug_completion_time: new Date().toISOString(),
              fix_applied: true,
            });

            // 记录成功的debug交互
            AgentMemoryService.recordOperationInteraction(
              notebookId,
              'debug' as AgentType,
              'debug_completed',
              true,
              {
                completion_time: new Date().toISOString(),
                fix_applied: true,
                code_executed: true,
                interaction_type: 'debug_session',
              }
            );
          }
        }
      } catch (error) {
        agentLog.error('Failed to record debug completion', { error });
      }
      break;
    }

    case 'setCurrentCellMode_onlyCode': {
      agentLog.debug('Setting current cell mode to code only', { data });
      await globalUpdateInterface.setCurrentCellMode_onlyCode();
      break;
    }

    case 'setCurrentCellMode_onlyOutput': {
      agentLog.debug('Setting current cell mode to output only', { data });
      await globalUpdateInterface.setCurrentCellMode_onlyOutput();

      // 记录代码生成完成
      try {
        const notebookState = (window as any).__notebookStore?.getState?.();
        const notebookId = notebookState?.notebookId;
        const commandId = normalizedData.data?.payload?.commandId;

        if (notebookId && commandId) {
          agentLog.info('Recording code generation completion', { commandId });

          // 记录成功的代码生成交互
          AgentMemoryService.recordOperationInteraction(
            notebookId,
            'command' as AgentType,
            'user_command',
            true,
            {
              command_id: commandId,
              completion_time: new Date().toISOString(),
              status: 'code_generated_and_executed',
            }
          );
        }
      } catch (error) {
        agentLog.error('Failed to record code generation interaction', { error });
      }
      break;
    }

    case 'setCurrentCellMode_complete': {
      agentLog.debug('Setting current cell mode to full', { data });
      await globalUpdateInterface.setCurrentCellMode_complete();
      break;
    }

    case 'initStreamingAnswer': {
      agentLog.info('Initializing streaming response', { data });
      const qid = normalizedData.data?.payload?.QId || normalizedData.payload?.QId;
      if (qid !== undefined && qid !== null) {
        const qidStr = Array.isArray(qid) ? qid[0] : qid.toString();
        await globalUpdateInterface.initStreamingAnswer(qidStr);
        // 记录当前正在流式的 QA，便于 finish 阶段后台未返回 QId 时兜底
        lastStreamingQaId = qidStr;

        // 打开右侧边栏并切换到 QA 视图
        try {
          const notebookState = useStore.getState();
          notebookState.setIsRightSidebarCollapsed(false);
          console.log('✅ [initStreamingAnswer] 打开右侧边栏显示 QA');

          // 切换到 QA 视图
          const { useAIAgentStore } = await import('../store/AIAgentStore');
          useAIAgentStore.getState().setActiveView('qa');
          console.log('✅ [initStreamingAnswer] 切换到 QA 视图');
        } catch (error) {
          console.error('❌ [initStreamingAnswer] 打开侧边栏失败:', error);
        }

        // 记录QA交互开始
        try {
          const notebookState = (window as any).__notebookStore?.getState?.();
          const notebookId = notebookState?.notebookId;

          if (notebookId) {
            agentLog.info('Recording QA interaction start', { qid: qidStr });

            // 更新用户意图和当前上下文
            AgentMemoryService.updateCurrentContext(notebookId, 'general' as AgentType, {
              current_qa_id: qidStr,
              interaction_start_time: new Date().toISOString(),
              interaction_status: 'in_progress',
            });
          }
        } catch (error) {
          console.error('记录QA开始时出错:', error);
        }
      } else {
        console.error('Missing QId in stream data:', data);
      }
      break;
    }

    case 'addContentToAnswer': {
      console.log('添加内容到流式响应:', data);
      const contentQid = normalizedData.data?.payload?.QId || normalizedData.payload?.QId;
      const content = normalizedData.data?.payload?.content || normalizedData.payload?.content;
      if (contentQid !== undefined && contentQid !== null && content) {
        const qidStr = Array.isArray(contentQid) ? contentQid[0] : contentQid.toString();
        await globalUpdateInterface.addContentToAnswer(qidStr, content.toString());

        // 确保右侧边栏是打开的并且显示 QA 视图
        try {
          const notebookState = useStore.getState();
          if (notebookState.isRightSidebarCollapsed) {
            notebookState.setIsRightSidebarCollapsed(false);
            console.log('✅ [addContentToAnswer] 打开右侧边栏显示 QA');
          }

          const { useAIAgentStore } = await import('../store/AIAgentStore');
          const aiState = useAIAgentStore.getState();
          if (aiState.activeView !== 'qa') {
            aiState.setActiveView('qa');
            console.log('✅ [addContentToAnswer] 切换到 QA 视图');
          }
        } catch (error) {
          console.error('❌ [addContentToAnswer] 确保侧边栏显示失败:', error);
        }
      } else {
        console.error('Missing QId or content in stream data:', data);
      }
      break;
    }

    case 'finishStreamingAnswer': {
      console.log('结束流式响应:', data);
      const finishQid = normalizedData.data?.payload?.QId || normalizedData.payload?.QId;
      const finalResponse =
        normalizedData.data?.payload?.response || normalizedData.payload?.response || '';
      let qidStr: string | null = null;
      if (finishQid !== undefined && finishQid !== null) {
        qidStr = Array.isArray(finishQid) ? finishQid[0] : finishQid.toString();
      } else {
        // 兜底：使用最后一次 init 的 QA id，或查找正在处理的 QA
        qidStr = lastStreamingQaId;
        if (!qidStr) {
          try {
            // 动态访问，避免引入循环依赖类型问题
            // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
            const state = (require('../store/AIAgentStore') as any).useAIAgentStore?.getState?.();
            const candidate = state?.qaList?.find?.((q: any) => q.onProcess);
            qidStr = candidate?.id || null;
          } catch {
            // Ignore store access errors
          }
        }
      }
      if (qidStr) {
        await globalUpdateInterface.finishStreamingAnswer(qidStr, finalResponse);
        lastStreamingQaId = null;

        // 记录Agent交互完成
        try {
          const response = finalResponse;
          if (response) {
            // 从全局状态获取notebook信息进行记录
            const notebookState = (window as any).__notebookStore?.getState?.();
            const notebookId = notebookState?.notebookId;

            if (notebookId) {
              console.log('记录QA交互完成 - notebookId:', notebookId, '响应长度:', response.length);

              // 更新当前上下文状态
              AgentMemoryService.updateCurrentContext(notebookId, 'general' as AgentType, {
                current_qa_id: qidStr,
                interaction_status: 'completed',
                completion_time: new Date().toISOString(),
                response_quality: response.length > 100 ? 'detailed' : 'brief',
              });

              // 记录成功的问答交互
              AgentMemoryService.recordOperationInteraction(
                notebookId,
                'general' as AgentType,
                'qa_completed',
                true, // 暂时标记为成功，后续可根据用户反馈调整
                {
                  question_id: qidStr,
                  response_length: response.length,
                  completion_time: new Date().toISOString(),
                  response_preview: response.substring(0, 200), // 保存响应预览
                  interaction_type: 'qa_session',
                }
              );

              // 根据响应质量学习成功模式
              // 留空：如需学习成功模式，请在 AgentMemoryService 中实现 learnFromSuccess 并在此启用
            }
          }
        } catch (error) {
          console.error('记录QA交互时出错:', error);
        }
      } else {
        console.error('Missing QId in stream data:', data);
      }
      break;
    }

    case 'addNewContent2CurrentCellDescription': {
      console.log('添加新的chunk到当前的cell的描述');
      const content = normalizedData.data?.payload?.content;
      if (content) {
        await globalUpdateInterface.addNewContent2CurrentCellDescription(content);
      }
      break;
    }

    case 'convertCurrentCodeCellToHybridCell': {
      console.log('将当前代码cell转换为混合cell:', data);
      await globalUpdateInterface.convertCurrentCodeCellToHybridCell();
      break;
    }

    case 'convertCurrentHybridCellToLinkCell': {
      console.log('将当前混合cell转换为链接cell:', data);
      const content = normalizedData.data?.payload?.content;
      const commandId = normalizedData.data?.payload?.commandId;
      const metadata = normalizedData.data?.payload?.metadata || {};

      if (content) {
        // 获取当前 cell 并转换为 link 类型
        const state = useStore.getState();
        const currentCell = state.cells.find((c) => c.id === state.currentCellId);

        if (currentCell) {
          // 更新 cell 类型和内容
          state.updateCell(currentCell.id, content);
          state.updateCellType(currentCell.id, 'link');

          // 更新 metadata
          if (metadata) {
            state.updateCellMetadata(currentCell.id, metadata);
          }

          console.log('✅ 成功转换为 LinkCell:', currentCell.id);
        } else {
          console.warn('⚠️ 未找到当前 cell，无法转换');
        }
      }
      break;
    }

    case 'updateCurrentCellWithContent': {
      console.log('🔄 [updateCurrentCellWithContent] 更新当前cell的内容:', data);
      const content = normalizedData.data?.payload?.content;
      const cellId = normalizedData.data?.payload?.cellId;
      const commandId = normalizedData.data?.payload?.commandId;
      const uniqueIdentifier = normalizedData.data?.payload?.uniqueIdentifier;

      console.log('🔍 [updateCurrentCellWithContent] 参数:', {
        cellId,
        commandId,
        uniqueIdentifier,
        contentLength: content?.length,
        trackerSize: generationCellTracker.size,
        trackerKeys: Array.from(generationCellTracker.keys()),
        hasCommandIdInTracker: commandId ? generationCellTracker.has(commandId) : false,
      });

      if (content) {
        let targetCellId = cellId; // 如果直接提供了cellId，优先使用

        // 尝试使用uniqueIdentifier直接更新（最高优先级）
        if (!targetCellId && uniqueIdentifier) {
          const success = useStore
            .getState()
            .updateCellByUniqueIdentifier(uniqueIdentifier, { content });
          if (success) {
            console.log('✅ 通过uniqueIdentifier成功更新cell内容:', uniqueIdentifier);
            break;
          }
        }

        if (!targetCellId && commandId && generationCellTracker.has(commandId)) {
          // 使用commandId从映射表获取cellId
          targetCellId = generationCellTracker.get(commandId);
          console.log('✅ [updateCurrentCellWithContent] 从映射表获取cellId:', {
            commandId,
            targetCellId,
          });
        } else if (!targetCellId && commandId) {
          console.error('❌ [updateCurrentCellWithContent] commandId不在映射表中:', {
            commandId,
            trackerKeys: Array.from(generationCellTracker.keys()),
          });
        }

        if (targetCellId) {
          // 直接更新指定的cell
          console.log(
            '✅ 更新指定cell的内容:',
            targetCellId,
            'content preview:',
            content.substring(0, 100)
          );
          await globalUpdateInterface.updateCell(targetCellId, content);
          console.log('✅ 指定cell内容更新完成');
        } else {
          // 回退到原有逻辑
          const lastAddedCellId = globalUpdateInterface.getAddedLastCellID();
          console.log('⬇️ 回退逻辑 - lastAddedCellId:', lastAddedCellId);

          if (lastAddedCellId) {
            // Check if the last added cell has generation metadata (likely a generation cell)
            const cells = useStore.getState().cells;
            const targetCell = cells.find((cell) => cell.id === lastAddedCellId);
            console.log(
              '🔍 找到的targetCell:',
              targetCell?.id,
              'isGenerating:',
              targetCell?.metadata?.isGenerating
            );

            if (targetCell && targetCell.metadata?.isGenerating) {
              console.log('✅ 更新最后添加的生成cell内容:', lastAddedCellId);
              await globalUpdateInterface.updateCell(lastAddedCellId, content);
              console.log('✅ 生成cell内容更新完成');
            } else {
              // 使用最后一个 cell
              console.log('⬇️ 使用最后一个cell作为默认');
              if (cells.length > 0) {
                const lastCell = cells[cells.length - 1];
                console.log('✅ 使用最后一个cell:', lastCell.id);
                await globalUpdateInterface.updateCell(lastCell.id, content);
              } else {
                console.error('❌ 没有任何cell可以更新内容');
              }
            }
          } else {
            // 使用最后一个 cell
            console.warn('⚠️ 无lastAddedCellId，使用最后一个cell作为默认');
            const cells = useStore.getState().cells;
            if (cells.length > 0) {
              const lastCell = cells[cells.length - 1];
              console.log('✅ 使用最后一个cell:', lastCell.id);
              await globalUpdateInterface.updateCell(lastCell.id, content);
            } else {
              console.error('❌ 没有任何cell可以更新内容');
            }
          }
        }
      } else {
        console.error('❌ updateCurrentCellWithContent - 没有content数据');
      }
      break;
    }

    // TipTap 富文本主动更新（流式或替换）
    case 'tiptap_update': {
      const cellId = normalizedData.data?.payload?.cellId || normalizedData.payload?.cellId;
      const content = normalizedData.data?.payload?.content || normalizedData.payload?.content;
      const replace =
        (normalizedData.data?.payload as any)?.replace ??
        (normalizedData.payload as any)?.replace ??
        false;
      if (!cellId || typeof content !== 'string') {
        console.warn('tiptap_update: invalid payload', data);
        break;
      }
      const state = useStore.getState();
      const target = state.cells.find((c) => c.id === cellId);
      if (!target) {
        console.warn('tiptap_update: cell not found', cellId);
        break;
      }
      if (replace) {
        state.updateCell(cellId, content);
      } else {
        state.updateCell(cellId, (target.content || '') + content);
      }
      // 可选：确保处于编辑态便于用户看到实时变化
      if (state.editingCellId !== cellId) {
        state.setEditingCellId(cellId);
      }
      break;
    }

    case 'updateCurrentCellMetadata': {
      console.log('🔄 [updateCurrentCellMetadata] 更新当前cell metadata:', data);
      const metadata = normalizedData.data?.payload?.metadata;
      const commandId = normalizedData.data?.payload?.commandId;
      const cellId = normalizedData.data?.payload?.cellId;
      const uniqueIdentifier = normalizedData.data?.payload?.uniqueIdentifier;

      console.log('🔍 [updateCurrentCellMetadata] 参数:', {
        metadata,
        commandId,
        cellId,
        uniqueIdentifier,
        trackerSize: generationCellTracker.size,
        trackerKeys: Array.from(generationCellTracker.keys()),
        hasCommandIdInTracker: commandId ? generationCellTracker.has(commandId) : false,
      });

      if (metadata) {
        let targetCellId = cellId; // 如果直接提供了cellId，优先使用

        // 尝试使用uniqueIdentifier直接更新（最高优先级）
        if (!targetCellId && uniqueIdentifier) {
          const success = useStore
            .getState()
            .updateCellByUniqueIdentifier(uniqueIdentifier, { metadata });
          if (success) {
            console.log('✅ 通过uniqueIdentifier成功更新cell metadata:', uniqueIdentifier);

            // 如果生成完成，清理相关映射
            if (metadata.isGenerating === false || metadata.generationCompleted) {
              if (commandId) generationCellTracker.delete(commandId);
              generationCellTracker.delete(`unique-${uniqueIdentifier}`);
              console.log('清理完成的生成任务映射:', { commandId, uniqueIdentifier });
            }
            break;
          }
        }

        // 首先尝试使用 commandId 从映射表中获取 cellId
        if (!targetCellId && commandId && generationCellTracker.has(commandId)) {
          targetCellId = generationCellTracker.get(commandId);
          console.log('✅ [updateCurrentCellMetadata] 从映射表获取cellId:', {
            commandId,
            targetCellId,
          });

          // 如果生成完成，清理映射表
          if (metadata.isGenerating === false || metadata.generationCompleted) {
            generationCellTracker.delete(commandId);
            console.log('🧹 [updateCurrentCellMetadata] 清理完成的生成任务映射:', commandId);
          }
        } else if (!targetCellId && commandId) {
          console.error('❌ [updateCurrentCellMetadata] commandId不在映射表中:', {
            commandId,
            trackerKeys: Array.from(generationCellTracker.keys()),
          });
        }

        if (!targetCellId) {
          // 回退方案：尝试使用 lastAddedCellId
          targetCellId = globalUpdateInterface.getAddedLastCellID();
          console.log(
            '⬇️ [updateCurrentCellMetadata] 使用lastAddedCellId作为fallback:',
            targetCellId
          );
        }

        if (targetCellId) {
          console.log('🔄 正在更新cell metadata, cellId:', targetCellId, 'metadata:', metadata);
          // Use the proper updateCellMetadata method
          useStore.getState().updateCellMetadata(targetCellId, metadata);
          console.log('✅ metadata更新完成');

          // 额外验证：检查更新后的状态
          const updatedCells = useStore.getState().cells;
          const updatedCell = updatedCells.find((c) => c.id === targetCellId);
          console.log('📋 验证更新后的cell:', {
            id: updatedCell?.id,
            contentLength: updatedCell?.content?.length,
            metadata: updatedCell?.metadata,
          });
        } else {
          console.warn('⚠️ 无法确定目标cellId，使用最后一个cell作为默认');
          // 获取最后一个 cell
          const cells = useStore.getState().cells;
          if (cells.length > 0) {
            const lastCell = cells[cells.length - 1];
            console.log('✅ 使用最后一个cell:', lastCell.id);
            useStore.getState().updateCellMetadata(lastCell.id, metadata);
          } else {
            console.error('❌ 没有任何cell可以更新metadata');
          }
        }
      } else {
        console.error('❌ updateCurrentCellMetadata - 没有metadata数据');
      }
      break;
    }

    case 'addNewPhase2Next': {
      console.log('添加新的phase到下一个:', data);
      const description = normalizedData.data?.payload?.description;
      const content = normalizedData.data?.payload?.content;

      if (description) {
        await globalUpdateInterface.addNewCell2Next('markdown', description);
      }
      if (content) {
        await globalUpdateInterface.addNewContent2CurrentCell(content);
      }
      break;
    }

    case 'update_notebook_title': {
      const title = normalizedData.payload?.title;
      if (title) {
        // 更新notebook标题
        console.log('更新notebook标题:', title);
        useStore.getState().updateTitle(title);
        await showToast({
          message: `标题已更新: ${title}`,
          type: 'success',
        });

        // 注意: 标题更新是 notebook 的内部操作,不应该显示在 QA 回答中
      }
      break;
    }

    case 'get_variable': {
      const variableName = normalizedData.payload?.variable_name;
      const defaultValue = normalizedData.payload?.default_value;
      console.log('获取变量:', variableName, '默认值:', defaultValue);
      // 这里可以添加获取变量的逻辑
      break;
    }

    case 'set_variable': {
      const variableName = normalizedData.payload?.variable_name;
      const variableValue = normalizedData.payload?.variable_value;
      const variableType = normalizedData.payload?.variable_type;
      console.log('设置变量:', variableName, '=', variableValue, '类型:', variableType);
      // 这里可以添加设置变量的逻辑
      break;
    }

    case 'remember_information': {
      const rememberType = normalizedData.payload?.type;
      const content = normalizedData.payload?.content;
      console.log('记忆信息:', rememberType, content);
      // 这里可以添加记忆信息的逻辑
      break;
    }

    case 'update_todo': {
      const action = normalizedData.payload?.action;
      const event = normalizedData.payload?.event;
      const content = normalizedData.payload?.content;
      console.log('更新TODO:', action, event, content);
      // 这里可以添加TODO管理的逻辑
      // 同时也可将有代表性的操作记录到当前QA的工具调用中
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
        const { useAIAgentStore } = require('../store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];
        if (runningQA && (action || event)) {
          const op = String(action || event);
          // 仅在常见操作时添加，避免噪音
          if (/add-text|insert|draw|image|create|update/i.test(op)) {
            state.addToolCallToQA(runningQA.id, {
              type: op.toLowerCase(),
              content: typeof content === 'string' ? content : JSON.stringify(content),
              agent: 'workflow',
            });
          }
        }
      } catch {
        // Ignore agent store update errors
      }
      break;
    }

    case 'communicate_with_agent': {
      const targetAgent = normalizedData.payload?.target_agent;
      const message = normalizedData.payload?.message;
      console.log('与Agent通信:', targetAgent, message);
      // 这里可以添加Agent间通信的逻辑
      break;
    }

    case 'open_link_in_split': {
      console.log('🔗 Received open_link_in_split event:', data);
      const href = normalizedData.payload?.href || normalizedData.data?.payload?.href;
      const label = normalizedData.payload?.label || normalizedData.data?.payload?.label;
      const notebookId =
        normalizedData.payload?.notebook_id || normalizedData.data?.payload?.notebook_id;
      console.log('🔗 Extracted values:', { href, label, notebookId });

      if (href && notebookId) {
        try {
          const linkMarkdown = `[${label || 'Webpage'}](${href})`;

          // 添加小延迟，确保 LinkCell 完全创建完成
          await new Promise((resolve) => setTimeout(resolve, 100));

          const state = useStore.getState();

          // 查找最近创建的匹配的 LinkCell（后端应该已经通过 addCell2EndWithContent 创建了）
          const existing = [...state.cells]
            .reverse()
            .find(
              (c) =>
                c.type === 'link' &&
                typeof c.content === 'string' &&
                (c.content.includes(href) || c.content === linkMarkdown)
            );

          if (existing) {
            console.log('🔗 Found existing LinkCell:', existing.id);
            // 分屏打开现有的 LinkCell
            state.setDetachedCellId(existing.id);
            console.log('🔗 Set detached cell ID:', existing.id);
          } else {
            console.warn('🔗 No matching LinkCell found for href:', href);
            // 如果没找到，创建一个新的（备用方案）
            const cellId = await globalUpdateInterface.addNewCell2End('link', '网页预览');
            await globalUpdateInterface.updateCell(cellId, linkMarkdown);
            console.log('🔗 Created new LinkCell:', cellId);
            state.setDetachedCellId(cellId);
            console.log('🔗 Set detached cell ID:', cellId);
          }

          // 触发预览：解析到实际文件并加载
          const { default: usePreviewStore } = await import('../store/previewStore');
          const filePath = href.replace(/^\.\//, '');
          const fileName = filePath.split('/').pop() || filePath;

          // 根据文件扩展名确定文件类型
          const getFileTypeFromExtension = (filename: string) => {
            const ext = filename.split('.').pop()?.toLowerCase();
            if (ext === 'jsx' || ext === 'tsx') return 'jsx';
            if (ext === 'html' || ext === 'htm') return 'html';
            if (ext === 'csv') return 'csv';
            if (ext === 'pdf') return 'pdf';
            if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(`.${ext}`))
              return 'image';
            return 'text';
          };

          const fileType = getFileTypeFromExtension(fileName);
          const fileObj = { name: fileName, path: filePath, type: fileType } as any;
          console.log('🔗 About to preview file:', { filePath, fileName, fileType, fileObj });

          await usePreviewStore
            .getState()
            .previewFile(notebookId, filePath, { file: fileObj } as any);
          console.log(
            '🔗 Preview file called, current mode:',
            usePreviewStore.getState().previewMode
          );

          // 不要自动切换视图模式，保持在当前的 notebook 视图
          // 用户可以手动切换到 file 预览模式如果需要的话
          console.log('🔗 Keeping current view mode, not switching to file mode');

          // 触发文件列表刷新，显示新生成的 .sandbox 文件
          try {
            // 触发全局文件列表刷新事件
            window.dispatchEvent(new CustomEvent('refreshFileList'));
            console.log('🔗 Triggered file list refresh');
          } catch (refreshError) {
            uiLog.warn('Failed to trigger file list refresh', { error: refreshError });
          }

          const contentType =
            fileType === 'jsx' ? 'React组件' : fileType === 'html' ? '网页' : '文件';
          await showToast({
            message: `${contentType}已生成并打开预览: ${label}`,
            type: 'success',
          });
        } catch (e) {
          console.error('open_link_in_split failed:', e);
          await showToast({
            message: `分屏预览失败: ${e.message}`,
            type: 'error',
          });
        }
      } else {
        console.warn('🔗 Missing required data for open_link_in_split:', { href, notebookId });
      }
      break;
    }

    case 'ask_agent_for_help': {
      const targetAgent = normalizedData.payload?.target_agent;
      const helpRequest = normalizedData.payload?.help_request;
      console.log('请求Agent帮助:', targetAgent, helpRequest);
      // 这里可以添加Agent帮助请求的逻辑
      break;
    }

    case 'trigger_image_generation': {
      const prompt = normalizedData.payload?.prompt;
      const commandId = normalizedData.payload?.commandId;
      if (prompt && commandId) {
        console.log('触发图片生成:', prompt);

        // 获取当前notebook状态和操作器
        const notebookState = useStore.getState();
        const notebookId = notebookState.notebookId;
        // const currentCellId = notebookState.currentCellId; // not used
        const viewMode = notebookState.viewMode;
        const currentPhaseId = notebookState.currentPhaseId;
        const currentStepIndex = notebookState.currentStepIndex;

        // 使用 dynamic import 来获取 operatorStore 以避免循环依赖
        const { default: useOperatorStore } = await import('../store/operatorStore');

        // 发送/image命令到后端
        const imageCommand = {
          type: 'user_command',
          payload: {
            content: `/image ${prompt}`,
            commandId: commandId,
            current_view_mode: viewMode,
            current_phase_id: currentPhaseId,
            current_step_index: currentStepIndex,
            notebook_id: notebookId,
          },
        };

        console.log('发送图片生成命令到后端:', imageCommand);
        useOperatorStore.getState().sendOperation(notebookId, imageCommand);

        await showToast({
          message: `开始生成图片: ${prompt.substring(0, 30)}...`,
          type: 'info',
        });

        // 将工具调用记录到当前进行中的 QA（如果有）
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
          const { useAIAgentStore } = require('../store/AIAgentStore');
          const state = useAIAgentStore.getState();
          const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];
          if (runningQA) {
            state.addToolCallToQA(runningQA.id, {
              type: 'draw-image',
              content: prompt,
              agent: 'image-generator',
            });
          }
        } catch (error) {
          console.error('添加工具调用到QA失败:', error);
        }
      }
      break;
    }

    case 'trigger_webpage_generation': {
      const prompt = normalizedData.payload?.prompt;
      const commandId = normalizedData.payload?.commandId;
      if (prompt && commandId) {
        console.log('触发网页生成:', prompt);

        // 获取当前notebook状态和操作器
        const notebookState = useStore.getState();
        const notebookId = notebookState.notebookId;
        const viewMode = notebookState.viewMode;
        const currentPhaseId = notebookState.currentPhaseId;
        const currentStepIndex = notebookState.currentStepIndex;

        // 使用 dynamic import 来获取 operatorStore 以避免循环依赖
        const { default: useOperatorStore } = await import('../store/operatorStore');

        // 发送/webpage命令到后端
        const webpageCommand = {
          type: 'user_command',
          payload: {
            content: `/webpage ${prompt}`,
            commandId: commandId,
            current_view_mode: viewMode,
            current_phase_id: currentPhaseId,
            current_step_index: currentStepIndex,
            notebook_id: notebookId,
          },
        };

        console.log('发送网页生成命令到后端:', webpageCommand);
        useOperatorStore.getState().sendOperation(notebookId, webpageCommand);

        await showToast({
          message: `开始生成网页: ${prompt.substring(0, 30)}...`,
          type: 'info',
        });

        // 将工具调用记录到当前进行中的 QA（如果有）
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
          const { useAIAgentStore } = require('../store/AIAgentStore');
          const state = useAIAgentStore.getState();
          const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];
          if (runningQA) {
            state.addToolCallToQA(runningQA.id, {
              type: 'create-webpage',
              content: prompt,
              agent: 'webpage-generator',
            });
          }
        } catch (e) {
          console.warn('记录工具调用失败（忽略）：', e);
        }
      }
      break;
    }

    // 统一的视频生成入口（与 text2video_agent 对应）
    case 'trigger_video_generation': {
      const prompt = normalizedData.payload?.prompt;
      const commandId = normalizedData.payload?.commandId;
      if (prompt && commandId) {
        console.log('触发视频生成:', prompt);
        const notebookState = useStore.getState();
        const notebookId = notebookState.notebookId;
        const viewMode = notebookState.viewMode;
        const currentPhaseId = notebookState.currentPhaseId;
        const currentStepIndex = notebookState.currentStepIndex;
        const { default: useOperatorStore } = await import('../store/operatorStore');
        const videoCommand = {
          type: 'user_command',
          payload: {
            content: `/video ${prompt}`,
            commandId: commandId,
            current_view_mode: viewMode,
            current_phase_id: currentPhaseId,
            current_step_index: currentStepIndex,
            notebook_id: notebookId,
          },
        };
        console.log('发送视频生成命令到后端:', videoCommand);
        useOperatorStore.getState().sendOperation(notebookId, videoCommand);
        await showToast({ message: `开始生成视频: ${prompt.substring(0, 30)}...`, type: 'info' });

        // 记录到当前 QA 的工具调用
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
          const { useAIAgentStore } = require('../store/AIAgentStore');
          const state = useAIAgentStore.getState();
          const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];
          if (runningQA) {
            state.addToolCallToQA(runningQA.id, {
              type: 'create-video',
              content: prompt,
              agent: 'video-generator',
            });
          }
        } catch {
          // Ignore agent store update errors
        }
      }
      break;
    }

    // 新增：视频生成任务启动事件
    case 'video_generation_task_started': {
      const taskId = normalizedData.payload?.taskId;
      const commandId = normalizedData.payload?.commandId;
      const uniqueIdentifier = normalizedData.payload?.uniqueIdentifier;
      const prompt = normalizedData.payload?.prompt;

      if (taskId && uniqueIdentifier) {
        console.log('视频生成任务已启动，开始轮询状态:', { taskId, uniqueIdentifier });

        // 启动前端状态轮询
        startVideoGenerationPolling(taskId, uniqueIdentifier, commandId, prompt);

        await showToast({
          message: `视频生成任务已启动，正在后台处理...`,
          type: 'info',
        });
      }
      break;
    }

    // 新增：视频生成状态更新事件
    case 'video_generation_status_update': {
      const taskId = normalizedData.payload?.taskId;
      const status = normalizedData.payload?.status;
      const videoUrl = normalizedData.payload?.videoUrl;
      const uniqueIdentifier = normalizedData.payload?.uniqueIdentifier;
      const commandId = normalizedData.payload?.commandId;
      const prompt = normalizedData.payload?.prompt;
      const error = normalizedData.payload?.error;

      console.log('收到视频生成状态更新:', { taskId, status, uniqueIdentifier });

      if (status === 'completed' && videoUrl && uniqueIdentifier) {
        // 生成完成，停止轮询
        if (activeVideoPolls.has(taskId)) {
          clearInterval(activeVideoPolls.get(taskId)!);
          activeVideoPolls.delete(taskId);
        }

        // 更新cell内容
        const videoMarkdown = `![${prompt || 'Generated Video'}](${videoUrl})`;
        const contentSuccess = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
          content: videoMarkdown,
        });

        // 更新cell metadata
        const metadataSuccess = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
          metadata: {
            isGenerating: false,
            generationCompleted: true,
            generationEndTime: Date.now(),
            videoUrl: videoUrl,
            generationStatus: 'completed',
          },
        });

        if (contentSuccess && metadataSuccess) {
          console.log('✅ 视频生成完成，内容已更新');
          await showToast({
            message: `视频生成完成！`,
            type: 'success',
          });
        }
      } else if (status === 'failed' || error) {
        // 生成失败，停止轮询
        if (activeVideoPolls.has(taskId)) {
          clearInterval(activeVideoPolls.get(taskId)!);
          activeVideoPolls.delete(taskId);
        }

        // 更新失败状态
        const success = useStore.getState().updateCellByUniqueIdentifier(uniqueIdentifier, {
          metadata: {
            isGenerating: false,
            generationError: error || 'Generation failed',
            generationStatus: 'failed',
          },
        });

        if (success) {
          console.log('❌ 视频生成失败状态已更新');
          await showToast({
            message: `视频生成失败: ${error || 'Unknown error'}`,
            type: 'error',
          });
        }
      }
      // 对于 'waiting', 'active', 'queued', 'generating' 等状态，继续等待轮询
      break;
    }

    default: {
      console.log(data);
      console.warn('未处理的流式响应类型:', data.type);
      break;
    }
  }
};
