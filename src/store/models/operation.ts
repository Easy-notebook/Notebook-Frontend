// src/store/models/operation.ts

export interface Operation {
  type: string;
  payload: Record<string, any>;
  id?: string;
  timestamp?: string;
}

export interface OperationResponseData {
  [key: string]: any;
}

/** Accepted means an HTTP response stream was established, not that execution succeeded. */
export type OperationSubmission =
  | { accepted: true; operationId: string; completion: Promise<void> }
  | { accepted: false; reason: 'busy' | 'failed' | 'cancelled'; message: string };
