import { ActionItem } from '@Store/models/agent';

export interface MergedAction extends ActionItem {
  count: number;
  originalActions: ActionItem[];
}

export interface ToolCall {
  type?: string;
  name?: string;
  content?: string;
  arguments?: string;
  agent?: string;
}
