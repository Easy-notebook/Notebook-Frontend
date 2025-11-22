// src/store/models/agent.ts
// Centralized agent-related shared types and helpers

export type EventType = string;

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
