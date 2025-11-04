// src/store/actionCreators.ts
import { EVENT_TYPES, EventType, ActionItem } from './AIAgentStore';
import { v4 as uuidv4 } from 'uuid';
import useStore from './notebookStore';

/**
 * 获取当前时间的格式化字符串 "HH:MM:SS"
 */
const getCurrentTimestamp = (): string => {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
};

/**
 * Action 创建时需要的基础参数类型
 */
export interface BaseActionParams {
    type: EventType;
    content: string;
    relatedQAIds?: string[];
    cellId?: string | null;
    result?: string;
    onProcess?: boolean;
}

/**
 * 基础 Action 创建函数
 * @param type - Action 的类型
 * @param content - Action 的内容
 * @param relatedQAIds - 相关的 QA IDs
 * @param cellId - 相关的 cell ID
 * @param result - Action 的结果
 * @param onProcess - Action 的处理状态
 * @returns 创建的 Action 对象
 */
const createAction = (
    type: EventType,
    content: string,
    relatedQAIds: string[] | string = [],
    cellId: string | null = null,
    result: string = '',
    onProcess: boolean = false
): ActionItem => {
    // Accept string or array; normalize to array
    if (!Array.isArray(relatedQAIds)) {
        relatedQAIds = typeof relatedQAIds === 'string' && relatedQAIds.length > 0
            ? [relatedQAIds]
            : [];
    }

    return {
        id: uuidv4(),
        type,
        timestamp: getCurrentTimestamp(),
        content,
        result,
        relatedQAIds,
        cellId,
        viewMode: useStore.getState().viewMode,
        onProcess,
    };
};

/**
 * 用户相关 Action 创建函数的参数类型
 */
export interface UserActionParams {
    content: string;
    relatedQAIds?: string[];
    cellId?: string | null;
}

/**
 * AI 相关 Action 创建函数的参数类型
 */
export interface AIActionParams {
    content: string;
    result?: string;
    relatedQAIds?: string[];
    cellId?: string | null;
    onProcess?: boolean;
}

/**
 * 系统事件 Action 创建函数的参数类型
 */
export interface SystemActionParams {
    content: string;
    result?: string;
    relatedQAIds?: string[];
    cellId?: string | null;
}

/**
 * 用户相关 Action 创建函数
 */
export const createUserAskQuestionAction = (
    content: string,
    relatedQAIds: string[] = [],
    cellId: string | null = null
): ActionItem =>
    createAction(EVENT_TYPES.USER_ASK_QUESTION, content, relatedQAIds, cellId);

export const createUserNewInstructionAction = (
    content: string,
    relatedQAIds: string[] = [],
    cellId: string | null = null
): ActionItem =>
    createAction(EVENT_TYPES.USER_NEW_INSTRUCTION, content, relatedQAIds, cellId);

export const createUserFileUploadAction = (
    content: string,
    relatedQAIds: string[] = [],
    cellId: string | null = null
): ActionItem =>
    createAction(EVENT_TYPES.USER_FILE_UPLOAD, content, relatedQAIds, cellId);

/**
 * AI 相关 Action 创建函数
 */
export const createAIUnderstandingAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_UNDERSTANDING, content, relatedQAIds, cellId, result, onProcess);

export const createAIExplainingProcessAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_EXPLAINING_PROCESS, content, relatedQAIds, cellId, result, onProcess);

export const createAIWritingCodeAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_WRITING_CODE, content, relatedQAIds, cellId, result, onProcess);

export const createAIRunningCodeAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_RUNNING_CODE, content, relatedQAIds, cellId, result, onProcess);

export const createAIAnalyzingResultsAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_ANALYZING_RESULTS, content, relatedQAIds, cellId, result, onProcess);

export const createAIFixingBugsAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_FIXING_BUGS, content, relatedQAIds, cellId, result, onProcess);

export const createAICriticalThinkingAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_CRITICAL_THINKING, content, relatedQAIds, cellId, result, onProcess);

export const createAIReplyingQuestionAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_REPLYING_QUESTION, content, relatedQAIds, cellId, result, onProcess);

export const createAIFixingCodeAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_FIXING_CODE, content, relatedQAIds, cellId, result, onProcess);

export const createAIGeneratingCodeAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_GENERATING_CODE, content, relatedQAIds, cellId, result, onProcess);

export const createAIGeneratingTextAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null,
    onProcess: boolean = false
): ActionItem =>
    createAction(EVENT_TYPES.AI_GENERATING_TEXT, content, relatedQAIds, cellId, result, onProcess);

/**
 * 系统事件 Action 创建函数
 */
export const createSystemEventAction = (
    content: string,
    result: string = '',
    relatedQAIds: string[] = [],
    cellId: string | null = null
): ActionItem =>
    createAction(EVENT_TYPES.SYSTEM_EVENT, content, relatedQAIds, cellId, result);