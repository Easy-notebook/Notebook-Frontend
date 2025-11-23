// src/store/models/code.ts

export const DISPLAY_MODES = {
  COMPLETE: 'complete',
  CODE_ONLY: 'code_only',
  OUTPUT_ONLY: 'output_only',
} as const;

export type DisplayMode = (typeof DISPLAY_MODES)[keyof typeof DISPLAY_MODES];

export interface CellExecutionState {
  isExecuting: boolean;
  isCancelling: boolean;
  elapsedTime: number;
  statusCheckInterval: number | null;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  outputs?: any[];
}

export interface KernelInitResult {
  status: string;
  notebook_id?: string;
  message?: string;
}

export interface ExecutionStatus {
  status: 'running' | 'idle' | 'error' | 'ok';
  elapsed_time?: number;
  outputs?: any[];
}
