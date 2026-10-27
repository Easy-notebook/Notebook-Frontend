import { AttachmentRecordResources } from '@Services/ai-terminal/AttachmentRecordResources';
// src/store/AIAgentStore.ts
import { create } from 'zustand';
import { StreamingAnswer } from './models/StreamingAnswer';
import { agentLog } from '@Utils/logger';
import { ActionItem, QAItem, QAEvent } from '@Store/models/agent';

// 定义事件类型
// 定义事件类型
// Moved to @Store/models/agent

// 事件类型的联合类型
// Moved to @Store/models/agent

// QA 项接口
// Types moved to @Store/models/agent

// 视图类型
export type ViewType = 'script' | 'qa' | 'todo' | 'debug' | 'workflow';

// Store 状态接口
export interface AIAgentState {
  // 当前视图: 'script' 或 'qa'
  activeView: ViewType;
  // 加载状态
  isLoading: boolean;
  // 命令输入框是否可见
  showCommandInput: boolean;
  // 所有的 actions
  actions: ActionItem[];
  // QA 列表
  qaList: QAItem[];
}

export type NewQAItem = Omit<QAItem, 'id' | 'timestamp' | 'onProcess'> & {
  id?: string;
  onProcess?: boolean;
};

// Store Actions 接口
export interface AIAgentActions {
  // 设置当前视图
  setActiveView: (view: ViewType) => void;
  // 设置加载状态
  setIsLoading: (loading: boolean) => void;
  // 设置命令输入框可见性
  setShowCommandInput: (visible: boolean) => void;

  // Actions CRUD
  addAction: (
    action: Omit<ActionItem, 'id' | 'timestamp' | 'onProcess'> & { onProcess?: boolean }
  ) => string;
  removeAction: (actionId: string) => void;
  updateAction: (actionId: string, updates: Partial<ActionItem>) => void;
  setActionProcess: (actionId: string, onProcess: boolean) => void;

  // Q&A CRUD
  addQA: (qa: NewQAItem) => void;
  removeQA: (qaId: string) => void;
  updateQA: (qaId: string, updates: Partial<QAItem>) => void;
  setQAProcess: (qaId: string, onProcess: boolean) => void;

  // 流式回答相关
  initStreamingAnswer: (qaId: string) => void;
  addContentToAnswer: (qaId: string, content: string) => boolean;
  finishStreamingAnswer: (qaId: string, response?: string) => boolean;
  cancelStreamingAnswer: (qaId: string) => void;
  // Tool call logging for QA
  addToolCallToQA: (qaId: string, toolCall: QAEvent) => void;
}

// 完整的 Store 类型
export type AIAgentStore = AIAgentState & AIAgentActions;

// 创建 Zustand store
export const useAIAgentStore = create<AIAgentStore>((set) => ({
  // 当前视图: 'script' 或 'qa'
  activeView: 'script',
  // 加载状态
  isLoading: false,
  // 命令输入框是否可见
  showCommandInput: false,
  // 所有的 actions
  actions: [],
  qaList: [],

  // 设置当前视图
  setActiveView: (view: ViewType) => set({ activeView: view }),
  // 设置加载状态
  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
  // 设置命令输入框可见性
  setShowCommandInput: (visible: boolean) => set({ showCommandInput: visible }),

  // Actions CRUD
  addAction: (
    action: Omit<ActionItem, 'id' | 'timestamp' | 'onProcess'> & { onProcess?: boolean }
  ) => {
    // 验证 relatedQAIds 是否为数组
    if (!Array.isArray(action.relatedQAIds)) {
      agentLog.warn('Invalid relatedQAIds type - defaulting to empty array', {
        received: typeof action.relatedQAIds,
        expected: 'array',
      });
      action.relatedQAIds = [];
    }

    const id = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    set((state) => ({
      actions: [
        {
          ...action,
          id,
          timestamp: new Date().toTimeString().split(' ')[0],
          onProcess: action.onProcess || false,
        },
        ...state.actions,
      ],
    }));
    return id;
  },

  removeAction: (actionId: string) => {
    set((state) => ({
      actions: state.actions.filter((action) => action.id !== actionId),
    }));
  },
  updateAction: (actionId: string, updates: Partial<ActionItem>) => {
    set((state) => ({
      actions: state.actions.map((action) =>
        action.id === actionId ? { ...action, ...updates } : action
      ),
    }));
  },
  setActionProcess: (actionId: string, onProcess: boolean) => {
    set((state) => ({
      actions: state.actions.map((action) =>
        action.id === actionId ? { ...action, onProcess } : action
      ),
    }));
  },

  // Q&A CRUD
  addQA: (qa: NewQAItem) => {
    set((state) => ({
      qaList: [
        {
          ...qa,
          id: qa.id || `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toTimeString().split(' ')[0],
          onProcess: qa.onProcess || false,
        },
        ...state.qaList,
      ],
    }));
  },
  removeQA: (qaId: string) => {
    set((state) => ({
      qaList: state.qaList.filter((qa) => qa.id !== qaId),
    }));
  },
  updateQA: (qaId: string, updates: Partial<QAItem>) => {
    set((state) => ({
      qaList: state.qaList.map((qa) => (qa.id === qaId ? { ...qa, ...updates } : qa)),
    }));
  },
  setQAProcess: (qaId: string, onProcess: boolean) => {
    set((state) => ({
      qaList: state.qaList.map((qa) => (qa.id === qaId ? { ...qa, onProcess } : qa)),
    }));
  },

  // 初始化流式回答
  initStreamingAnswer: (qaId: string) => {
    set((state) => {
      // 1. 找到目标 QA
      const targetIndex = state.qaList.findIndex((qa) => qa.id === qaId);
      if (targetIndex === -1) {
        agentLog.warn('QA not found for streaming answer initialization', { qaId });
        return state;
      }
      const targetQA = state.qaList[targetIndex];

      // Preserve the original question once; a restarted answer is not a new question.
      const questionId = `${qaId}-[0]`;
      const questionSnapshot: QAItem[] =
        targetQA.type === 'user' && !state.qaList.some((qa) => qa.id === questionId)
          ? [{ ...targetQA, id: questionId }]
          : [];

      // 3. 更新目标 QA：清空 content、设为未解决、设为正在处理
      const updatedTargetQA = new StreamingAnswer(targetQA).restart(Date.now());

      // 4. 组装新的 qaList
      const newQaList = [
        ...state.qaList.slice(0, targetIndex),
        updatedTargetQA, // 更新后的原 QA
        ...questionSnapshot,
        ...state.qaList.slice(targetIndex + 1),
      ];

      return { qaList: newQaList };
    });
  },

  addContentToAnswer: (qaId: string, content: string) => {
    let accepted = false;
    set((state) => {
      const answer = state.qaList.find((qa) => qa.id === qaId);
      if (!answer) return state;
      const next = new StreamingAnswer(answer).append(content);
      if (next === answer) return state;
      accepted = true;
      return { qaList: state.qaList.map((qa) => (qa === answer ? next : qa)) };
    });
    return accepted;
  },

  cancelStreamingAnswer: (qaId: string) => {
    set((state) => {
      const answer = state.qaList.find((qa) => qa.id === qaId);
      if (!answer) return state;
      const endedAt = Date.now();
      const next = new StreamingAnswer(answer).interrupt(endedAt);
      if (next === answer) return state;
      return {
        qaList: state.qaList.map((qa) =>
          qa === answer
            ? next
            : qa.id === `${qaId}-[0]`
              ? { ...qa, onProcess: false, thinkingEndAtMs: endedAt }
              : qa
        ),
      };
    });
  },

  finishStreamingAnswer: (qaId: string, response?: string) => {
    let accepted = false;
    set((state) => {
      const answer = state.qaList.find((qa) => qa.id === qaId);
      if (!answer) return state;
      const next = new StreamingAnswer(answer).complete(response, Date.now());
      if (next === answer) return state;
      accepted = true;
      return {
        qaList: state.qaList.map((qa) =>
          qa === answer ? next : qa.id === `${qaId}-[0]` ? { ...qa, resolved: true } : qa
        ),
      };
    });
    return accepted;
  },

  addToolCallToQA: (qaId: string, toolCall) => {
    set((state) => ({
      qaList: state.qaList.map((qa) => {
        if (qa.id === qaId) {
          const existing = Array.isArray(qa.toolCalls) ? qa.toolCalls : [];
          return { ...qa, toolCalls: [...existing, toolCall] };
        }
        return qa;
      }),
    }));
  },
}));

// Derive URL ownership from actual records, including bulk replacement and streaming copies.
const attachmentRecords = new AttachmentRecordResources();
useAIAgentStore.subscribe((state, previous) => {
  if (state.actions !== previous.actions || state.qaList !== previous.qaList) {
    attachmentRecords.update([...state.actions, ...state.qaList]);
  }
});
