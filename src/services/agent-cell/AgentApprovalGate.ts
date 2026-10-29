import type { ToolName } from './protocol';
export type ApprovalDecision = 'approve' | 'reject';
export const requiresAgentApproval = (name: ToolName) =>
  ['update_cell', 'run_cell', 'curate_context', 'apply_notebook_edits'].includes(name);
/** One-shot decisions are scoped by the session's current run and call identity. */
export class AgentApprovalGate {
  private readonly pending = new Map<string, (decision: ApprovalDecision) => void>();
  wait(callId: string, signal: AbortSignal): Promise<ApprovalDecision> {
    signal.throwIfAborted();
    if (this.pending.has(callId)) throw new Error('Approval already pending');
    return new Promise((resolve, reject) => {
      const clear = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.pending.delete(callId);
      };
      const abort = () => {
        clear();
        reject(signal.reason ?? new Error('Agent cancelled'));
      };
      const timer = setTimeout(
        () => {
          clear();
          reject(new Error('Approval expired; retry to read current notebook state'));
        },
        4 * 60 * 1000
      );
      this.pending.set(callId, (decision) => {
        clear();
        resolve(decision);
      });
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  resolve(callId: string, decision: ApprovalDecision) {
    const settle = this.pending.get(callId);
    if (!settle) throw new Error('This approval is no longer active');
    settle(decision);
  }
}
