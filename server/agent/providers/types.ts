import type { NotebookSkill } from '../skills/NotebookSkill';
import type {
  AgentEvent,
  ToolName,
  ToolResult,
  AgentRole,
} from '../../../src/services/agent-cell/protocol';
export interface ProviderSession {
  threadId?: string;
  cwd?: string;
  sourceSessionId?: string;
}
export interface ProviderRun {
  role?: AgentRole;
  notebookSkill?: NotebookSkill;
  instance?: { notebookId: string; agentId: string };
  prompt: string;
  session: ProviderSession;
  signal: AbortSignal;
  emit(event: AgentEvent): void;
  call(name: ToolName, args: unknown, onStart?: () => void): Promise<ToolResult>;
}
export interface AgentRuntime {
  run(run: ProviderRun): Promise<void>;
}
