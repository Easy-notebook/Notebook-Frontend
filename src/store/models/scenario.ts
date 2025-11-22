// src/store/models/scenario.ts

// Generic metadata attached to actions/cells in Scenario workflow
export interface ActionMetadata {
  [key: string]: any;
  isStep?: boolean;
  isChapter?: boolean;
  isSection?: boolean;
  isComment?: boolean;
  finished_thinking?: boolean;
  thinkingText?: string;
}

// Execution step passed into ScriptStore.execAction
export interface ExecutionStep {
  action: string;
  storeId?: string;
  content?: string;
  metadata?: ActionMetadata;
  agentName?: string;
  customText?: string | null;
  textArray?: string[];
  thinkingText?: string;
  text?: string;
  codecell_id?: string;
  need_output?: boolean;
  auto_debug?: boolean;
  title?: string;
  shotType?: string;
  level?: 'stages' | 'steps' | 'behaviors';
  focus?: string;
  outputs?: any;
  state?: any;
  language?: string;
  stepId?: string; // legacy
  phaseId?: string; // legacy
}

// Pipeline template types
export interface WorkflowStep {
  id: string;
  step_id: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface WorkflowStage {
  id: string;
  title: string;
  description: string;
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  metadata?: Record<string, any>;
}

export interface PlanningRequest {
  problem?: string;
  description?: string;
  requirements?: string;
  [key: string]: any;
}

// AI planning context snapshot and request comparison types
export interface AIContext {
  checklist: { current: string[]; completed: string[] };
  thinking: string[];
  variables: Record<string, unknown>;
  toDoList: string[];
  stageStatus: Record<string, boolean>;
  effect: { current: string[]; history: string[] };
}

export interface RequestContext {
  stepId: string;
  stageId: string;
  toDoList: string[];
  variables: Record<string, unknown>;
  thinkingLength: number;
}

// Transition handler context (FSM transitions)
export interface TransitionHandlerContext {
  scriptStore?: any;
  apiClient?: any;
  notebookStore?: any;
  aiContextStore?: any;
}

// API client config for WorkflowAPIClient
export interface WorkflowAPIClientConfig {
  baseURL: string;
  timeout?: number;
}

// Workflow FSM enums
export enum WorkflowState {
  IDLE = 'IDLE',
  STAGE_RUNNING = 'STAGE_RUNNING',
  STEP_RUNNING = 'STEP_RUNNING',
  BEHAVIOR_RUNNING = 'BEHAVIOR_RUNNING',
  BEHAVIOR_COMPLETED = 'BEHAVIOR_COMPLETED',
  STEP_COMPLETED = 'STEP_COMPLETED',
  STAGE_COMPLETED = 'STAGE_COMPLETED',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  PAUSED = 'PAUSED',
}

export enum WorkflowEvent {
  START_WORKFLOW = 'START_WORKFLOW',
  START_STAGE = 'START_STAGE',
  START_STEP = 'START_STEP',
  START_BEHAVIOR = 'START_BEHAVIOR',
  COMPLETE_BEHAVIOR = 'COMPLETE_BEHAVIOR',
  NEXT_BEHAVIOR = 'NEXT_BEHAVIOR',
  COMPLETE_STEP = 'COMPLETE_STEP',
  NEXT_STEP = 'NEXT_STEP',
  COMPLETE_STAGE = 'COMPLETE_STAGE',
  NEXT_STAGE = 'NEXT_STAGE',
  COMPLETE_WORKFLOW = 'COMPLETE_WORKFLOW',
  FAIL = 'FAIL',
  CANCEL = 'CANCEL',
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
}
