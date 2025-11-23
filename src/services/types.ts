export interface ApiResponse<T = any> {
  status: 'ok' | 'error';
  message?: string;
  data?: T;
}

export interface NotebookInitResponse extends ApiResponse {
  notebook_id?: string;
}

export interface ExecutionOutput {
  type: 'text' | 'image' | 'html' | 'error' | 'stream';
  content: string;
  key?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionResult extends ApiResponse {
  outputs?: ExecutionOutput[];
  error?: string;
  elapsed_time?: number;
}

export interface ExecutionStatus {
  status: 'running' | 'idle' | 'error' | 'ok';
  elapsed_time?: number;
  outputs?: any[];
  is_running?: boolean;
  current_task?: string;
  progress?: number;
  message?: string;
}

export interface UploadConfig {
  mode: string;
  allowedTypes?: string[];
  maxFiles?: number;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  path?: string;
}

export interface FileListResponse extends ApiResponse {
  files?: FileInfo[];
}

export interface FileContentResponse extends ApiResponse {
  content?: string;
  encoding?: string;
  type?: string;
}

export interface FileInfoResponse extends ApiResponse {
  info?: FileInfo;
}

export interface KernelStatus {
  kernel_id?: string;
  status?: 'starting' | 'idle' | 'busy' | 'dead';
  execution_count?: number;
}

export interface Cell {
  id: string;
  type: 'code' | 'markdown';
  content: string;
  outputs?: ExecutionOutput[];
  isExecuting?: boolean;
  error?: string;
  elapsed_time?: number;
}

export interface Operation {
  type: string;
  payload: Record<string, any>;
}

export interface CellExecutionResult {
  success: boolean;
  outputs: ExecutionOutput[];
  error?: string;
  elapsed_time?: number;
}

export interface CancellationResult {
  success: boolean;
  message?: string;
}
