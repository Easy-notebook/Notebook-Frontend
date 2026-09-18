// src/store/models/agent.ts
// Centralized agent-related shared types and helpers

export const EVENT_TYPES = {
  // 用户相关事件
  USER_ASK_QUESTION: 'user_ask_question', // 用户提出问题
  USER_NEW_INSTRUCTION: 'user_new_instruction', // 用户提出新指令
  USER_FILE_UPLOAD: 'user_file_upload', // 用户进行文件上传操作

  // AI 相关事件
  AI_UNDERSTANDING: 'ai_understanding', // AI 正在理解用户的问题和操作
  AI_EXPLAINING_PROCESS: 'ai_explaining_process', // AI 正在解释整个过程和思路
  AI_WRITING_CODE: 'ai_writing_code', // AI 正在书写代码
  AI_RUNNING_CODE: 'ai_running_code', // AI 正在运行代码并生成结果
  AI_ANALYZING_RESULTS: 'ai_analyzing_results', // AI 正在分析运行结果
  AI_FIXING_BUGS: 'ai_fixing_bugs', // AI 正在修复 BUG
  AI_CRITICAL_THINKING: 'ai_critical_thinking', // AI 正在进行批判性思考
  AI_REPLYING_QUESTION: 'ai_replying_question', // AI 正在回复问题
  AI_FIXING_CODE: 'ai_fixing_code', // AI 正在修复代码
  AI_GENERATING_CODE: 'ai_generating_code', // AI 正在生成代码
  AI_GENERATING_TEXT: 'ai_generating_text', // AI 正在生成文本
  SYSTEM_EVENT: 'system_event', // 系统事件
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface QAItem {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  resolved: boolean;
  onProcess: boolean;
  relatedActionIds?: string[];
  viewMode?: string;
  cellId?: string;
  agent?: string;
  model?: string;
  agentType?: string;
  toolCalls?: Array<{
    type?: string;
    name?: string;
    content?: string;
    arguments?: string;
    agent?: string;
  }>;
  thinkingStartAtMs?: number;
  thinkingEndAtMs?: number;
  // Additional fields for UI attachments
  attachedFiles?: any[];
}

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

export const timeHHMMSS = (): string => new Date().toTimeString().split(' ')[0];
