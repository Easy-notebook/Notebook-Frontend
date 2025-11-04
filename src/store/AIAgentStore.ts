// src/store/AIAgentStore.ts
import { create } from 'zustand';
import { agentLog } from '../utils/logger';

// 定义事件类型
export const EVENT_TYPES = {
    // 用户相关事件
    USER_ASK_QUESTION: 'user_ask_question',           // 用户提出问题
    USER_NEW_INSTRUCTION: 'user_new_instruction',     // 用户提出新指令
    USER_FILE_UPLOAD: 'user_file_upload',             // 用户进行文件上传操作

    // AI 相关事件
    AI_UNDERSTANDING: 'ai_understanding',             // AI 正在理解用户的问题和操作
    AI_EXPLAINING_PROCESS: 'ai_explaining_process',   // AI 正在解释整个过程和思路
    AI_WRITING_CODE: 'ai_writing_code',               // AI 正在书写代码
    AI_RUNNING_CODE: 'ai_running_code',               // AI 正在运行代码并生成结果
    AI_ANALYZING_RESULTS: 'ai_analyzing_results',     // AI 正在分析运行结果
    AI_FIXING_BUGS: 'ai_fixing_bugs',                 // AI 正在修复 BUG
    AI_CRITICAL_THINKING: 'ai_critical_thinking',     // AI 正在进行批判性思考
    AI_REPLYING_QUESTION: 'ai_replying_question',     // AI 正在回复问题
    AI_FIXING_CODE: 'ai_fixing_code',                 // AI 正在修复代码
    AI_GENERATING_CODE: 'ai_generating_code',         // AI 正在生成代码
    AI_GENERATING_TEXT: 'ai_generating_text',         // AI 正在生成文本
    SYSTEM_EVENT: 'system_event'                      // 系统事件
} as const;

// 事件类型的联合类型
export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// QA 项接口
export interface QAItem {
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: string;
    resolved: boolean;
    onProcess: boolean;
    relatedActionIds?: string[];
    // Optional fields used by UI components
    viewMode?: string;
    cellId?: string;
    // Assistant metadata
    agent?: string;
    model?: string;
    agentType?: string;
    // Tool calls metadata (loosely typed to support various providers)
    toolCalls?: Array<{
        type?: string;
        name?: string;
        content?: string;
        arguments?: string;
        agent?: string;
    }>;
    // Thinking timing
    thinkingStartAtMs?: number;
    thinkingEndAtMs?: number;
}

// Action 项接口
export interface ActionItem {
    id: string;
    type: EventType;
    timestamp: string;
    content: string;
    result: string;
    relatedQAIds: string[];
    cellId: string | null;
    viewMode: string;
    onProcess: boolean;
}

// 视图类型
export type ViewType = 'script' | 'qa' | 'todo' | 'debug';

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

// Store Actions 接口
export interface AIAgentActions {
    // 设置当前视图
    setActiveView: (view: ViewType) => void;
    // 设置加载状态
    setIsLoading: (loading: boolean) => void;
    // 设置命令输入框可见性
    setShowCommandInput: (visible: boolean) => void;

    // Actions CRUD
    addAction: (action: Omit<ActionItem, 'id' | 'timestamp' | 'onProcess'> & { onProcess?: boolean }) => void;
    removeAction: (actionId: string) => void;
    updateAction: (actionId: string, updates: Partial<ActionItem>) => void;
    setActionProcess: (actionId: string, onProcess: boolean) => void;

    // Q&A CRUD
    addQA: (qa: Omit<QAItem, 'timestamp' | 'onProcess'> & { onProcess?: boolean }) => void;
    removeQA: (qaId: string) => void;
    updateQA: (qaId: string, updates: Partial<QAItem>) => void;
    setQAProcess: (qaId: string, onProcess: boolean) => void;

    // 流式回答相关
    initStreamingAnswer: (qaId: string) => void;
    addContentToAnswer: (qaId: string, content: string) => void;
    finishStreamingAnswer: (qaId: string, response?: string) => void;
    // Tool call logging for QA
    addToolCallToQA: (qaId: string, toolCall: {
        type?: string;
        name?: string;
        content?: string;
        arguments?: string;
        agent?: string;
    }) => void;
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
    addAction: (action: Omit<ActionItem, 'id' | 'timestamp' | 'onProcess'> & { onProcess?: boolean }) => {
        // 验证 relatedQAIds 是否为数组
        if (!Array.isArray(action.relatedQAIds)) {
            agentLog.warn('Invalid relatedQAIds type - defaulting to empty array', { 
                received: typeof action.relatedQAIds,
                expected: 'array'
            });
            action.relatedQAIds = [];
        }

        set((state) => ({
            actions: [
                {
                    ...action,
                    id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toTimeString().split(' ')[0],
                    onProcess: action.onProcess || false
                },
                ...state.actions
            ]
        }));
    },
    
    removeAction: (actionId: string) => {
        set((state) => ({
            actions: state.actions.filter((action) => action.id !== actionId)
        }));
    },
    updateAction: (actionId: string, updates: Partial<ActionItem>) => {
        set((state) => ({
            actions: state.actions.map((action) =>
                action.id === actionId ? { ...action, ...updates } : action
            )
        }));
    },
    setActionProcess: (actionId: string, onProcess: boolean) => {
        set((state) => ({
            actions: state.actions.map((action) =>
                action.id === actionId ? { ...action, onProcess } : action
            )
        }));
    },

    // Q&A CRUD
    addQA: (qa: Omit<QAItem, 'timestamp' | 'onProcess'> & { onProcess?: boolean }) => {
        set((state) => ({
            qaList: [
                {
                    ...qa,
                    id: qa.id || `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toTimeString().split(' ')[0],
                    onProcess: qa.onProcess || false
                },
                ...state.qaList
            ]
        }));
    },
    removeQA: (qaId: string) => {
        set((state) => ({
            qaList: state.qaList.filter((qa) => qa.id !== qaId)
        }));
    },
    updateQA: (qaId: string, updates: Partial<QAItem>) => {
        set((state) => ({
            qaList: state.qaList.map((qa) =>
                qa.id === qaId ? { ...qa, ...updates } : qa
            )
        }));
    },
    setQAProcess: (qaId: string, onProcess: boolean) => {
        set((state) => ({
            qaList: state.qaList.map((qa) =>
                qa.id === qaId ? { ...qa, onProcess } : qa
            )
        }));
    },

    // 初始化流式回答
    initStreamingAnswer: (qaId: string) => {
        set((state) => {
            // 1. 找到目标 QA
            const targetIndex = state.qaList.findIndex((qa) => qa.id === qaId);
            if (targetIndex === -1) {
                agentLog.warn('QA not found for streaming answer initialization', { qaId });
                return {};
            }
            const targetQA = state.qaList[targetIndex];

            // 2. 创建一个新的 QA，除了 id 之外其他信息都复制原 QA
            const newQA: QAItem = {
                ...targetQA,
                id: `${targetQA.id}-[0]`,
            };

            // 3. 更新目标 QA：清空 content、设为未解决、设为正在处理
            const updatedTargetQA: QAItem = {
                ...targetQA,
                content: '',
                type: 'assistant',
                resolved: false,
                onProcess: true,
                thinkingStartAtMs: Date.now(),
            };

            // 4. 组装新的 qaList
            const newQaList = [
                ...state.qaList.slice(0, targetIndex),
                updatedTargetQA, // 更新后的原 QA
                newQA,           // 插入的新 QA
                ...state.qaList.slice(targetIndex + 1),
            ];

            return { qaList: newQaList };
        });
    },

    // 追加内容到答案
    addContentToAnswer: (qaId: string, content: string) => {
        set((state) => ({
            qaList: state.qaList.map((qa) =>
                qa.id === qaId
                    ? { ...qa, content: qa.content + content }
                    : qa
            )
        }));
    },

    // 完成回答
    finishStreamingAnswer: (qaId: string, response?: string) => {
        set((state) => ({
            qaList: state.qaList.map((qa) => {
                if (qa.id === qaId) {
                    return {
                        ...qa,
                        // 如果没有在流式过程中追加内容，则在结束时写入最终响应
                        content: response !== undefined && response !== null && qa.content === '' ? response : qa.content,
                        resolved: true,
                        onProcess: false,
                        thinkingEndAtMs: Date.now(),
                    };
                }
                if (qa.id === `${qaId}-[0]`) {
                    return {
                        ...qa,
                        resolved: true,
                    };
                }
                return qa;
            })
        }));
    },

    addToolCallToQA: (qaId: string, toolCall) => {
        set((state) => ({
            qaList: state.qaList.map((qa) => {
                if (qa.id === qaId) {
                    const existing = Array.isArray(qa.toolCalls) ? qa.toolCalls : [];
                    return { ...qa, toolCalls: [ ...existing, toolCall ] };
                }
                return qa;
            })
        }));
    },

}));