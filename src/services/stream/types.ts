/**
 * Stream Types - Shared type definitions for stream handling
 */

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
  label?: string;
  notebook_id?: string;
  response?: string;
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
  data: StreamData;
  payload: StreamPayload;
  showToast: ShowToastFunction;
}
