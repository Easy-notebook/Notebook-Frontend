/**
 * Stream Types - Shared type definitions for stream handling
 */

export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface StreamPayload {
  replace?: boolean;
  information?: string;
  category?: string;
  question?: string;
  agentType?: string;
  sourceAgent?: string;
  targetAgent?: string;
  taskName?: string;
  task?: string;
  result?: unknown;
  reason?: string;
  stage?: string;
  stageId?: string;
  previousStage?: string;
  details?: unknown;
  mode?: 'create' | 'step';
  phaseId?: string;
  index?: number;
  stepIndex?: number;
  allow?: boolean;
  cellId?: string;
  content?: string;
  outputs?: any[];
  cell?: any;
  position?: 'start' | 'end' | number;
  error?: string;
  type?: string;
  description?: string;
  QId?: string | number;
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
  taskId?: string;
  status?: string;
  videoUrl?: string;
  href?: string;
  url?: string;
  filePath?: string;
  label?: string;
  notebook_id?: string;
  response?: string;
  phaseName?: string;
}

export interface StreamData {
  type: string;
  payload?: StreamPayload;
  data?: {
    payload?: StreamPayload;
    message?: string;
    path?: string;
  };
  error?: string;
  commandId?: string;
  uniqueIdentifier?: string;
}

export type ShowToastFunction = (toast: ToastMessage) => Promise<void>;

/**
 * Context passed to stream actions
 */
export interface StreamActionContext {
  data?: StreamData;
  payload: StreamPayload;
  showToast: ShowToastFunction;
  notebookId?: string;
  currentCellId?: string;
  viewMode?: string;
  currentPhaseId?: string;
  currentStepIndex?: number;
}
