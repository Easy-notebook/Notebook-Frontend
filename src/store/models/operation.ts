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
