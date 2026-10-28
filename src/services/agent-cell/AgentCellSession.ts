import {
  AgentApprovalGate,
  requiresAgentApproval,
  type ApprovalDecision,
} from './AgentApprovalGate';
import type { AgentCellData, AgentEvent, AgentPhase, AgentTurn, ToolResult } from './protocol';
import type { AgentTransport } from './AgentTransport';
import { NotebookAgentTools, type NotebookAgentPorts } from './NotebookAgentTools';

export interface AgentSessionPorts extends NotebookAgentPorts {
  load(): AgentCellData;
  save(data: AgentCellData): void;
  context?(signal: AbortSignal): Promise<unknown>;
}
const transitions: Record<AgentPhase, readonly AgentPhase[]> = {
  idle: ['running'],
  running: ['cancelling', 'completed', 'failed'],
  cancelling: ['cancelled'],
  completed: ['running'],
  cancelled: ['running'],
  failed: ['running'],
};

/** A conversation owns one run at a time; late events cannot escape its notebook/cell identity. */
export class AgentCellSession {
  phase: AgentPhase = 'idle';
  private controller?: AbortController;
  private readonly approvals = new AgentApprovalGate();
  private currentTurnId?: string;
  resolve(sessionId: string, turnId: string, callId: string, decision: ApprovalDecision) {
    if (
      this.phase !== 'running' ||
      this.ports.notebookId() !== this.notebookId ||
      this.ports.load().sessionId !== sessionId ||
      this.currentTurnId !== turnId
    )
      throw new Error('Agent run ownership changed');
    this.approvals.resolve(callId, decision);
  }
  constructor(
    private readonly notebookId: string,
    private readonly cellId: string,
    private readonly ports: AgentSessionPorts,
    private readonly transport: AgentTransport
  ) {}
  get active() {
    return this.phase === 'running' || this.phase === 'cancelling';
  }
  private transition(next: AgentPhase) {
    if (!transitions[this.phase].includes(next))
      throw new Error(`Invalid agent transition ${this.phase} → ${next}`);
    this.phase = next;
  }
  cancel() {
    if (this.phase !== 'running') return;
    this.transition('cancelling');
    this.controller?.abort();
  }
  async send(prompt: string, retryOf?: string): Promise<void> {
    if (!prompt.trim() || this.active) return;
    if (this.ports.notebookId() !== this.notebookId) throw new Error('Notebook context changed');
    const initial = this.ports.load();
    this.transition('running');
    const controller = new AbortController();
    this.controller = controller;
    let data = initial;
    const sessionId = data.sessionId;
    const turn: AgentTurn = {
      id: crypto.randomUUID(),
      prompt: prompt.trim(),
      answer: '',
      actions: [],
      status: 'running',
      startedAt: Date.now(),
      retryOf,
    };
    this.currentTurnId = turn.id;
    data = { ...data, turns: [...data.turns, turn] };
    const current = () =>
      this.ports.notebookId() === this.notebookId &&
      this.ports
        .cells()
        .some(
          (cell) => cell.id === this.cellId && cell.type === 'agent' && cell.enableEdit !== false
        ) &&
      this.ports.load()?.sessionId === sessionId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let actionSnapshot: AgentTurn['actions'] = [];
    const publish = () => {
      clearTimeout(timer);
      timer = undefined;
      if (!current()) return;
      if (
        actionSnapshot.length !== turn.actions.length ||
        actionSnapshot.some((action, index) => action !== turn.actions[index])
      )
        actionSnapshot = [...turn.actions];
      // Summary is owned by the notebook tool and may have changed during this turn.
      this.ports.save({
        ...data,
        summary: this.ports.load().summary,
        turns: [...data.turns.slice(0, -1), { ...turn, actions: actionSnapshot }],
      });
    };
    const schedule = () => {
      timer ??= setTimeout(publish, 80);
    };
    const watch = this.ports.watch(() => {
      if (!current()) this.cancel();
    });
    const tools = new NotebookAgentTools(
      this.notebookId,
      this.cellId,
      this.ports,
      controller.signal,
      data.role ?? 'worker'
    );
    const results = new Map<string, ToolResult>();
    const receive = async (event: AgentEvent) => {
      controller.signal.throwIfAborted();
      if (!current()) throw new Error('Agent session ownership changed');
      if (event.type === 'text') {
        turn.answer += event.text;
        schedule();
      }
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'activity') {
        const action = {
          id: event.id,
          name: event.label,
          status: event.status,
          result: event.detail,
          kind: 'activity' as const,
          startedAt: turn.actions.find((item) => item.id === event.id)?.startedAt ?? Date.now(),
          endedAt: event.status === 'running' ? undefined : Date.now(),
        };
        const index = turn.actions.findIndex((item) => item.id === event.id);
        if (index < 0) turn.actions.push(action);
        else turn.actions[index] = action;
        schedule();
      }
      if (event.type === 'tool') {
        let result = results.get(event.callId);
        if (!result) {
          turn.actions.push({
            id: event.callId,
            name: event.name,
            arguments: event.arguments,
            status: requiresAgentApproval(event.name) ? 'waiting' : 'running',
            kind: 'tool',
            startedAt: Date.now(),
          });
          const approval = requiresAgentApproval(event.name)
            ? this.approvals.wait(event.callId, controller.signal)
            : undefined;
          publish();
          const decision = approval ? await approval : 'approve';
          controller.signal.throwIfAborted();
          if (!current()) throw new Error('Agent session ownership changed');
          if (decision === 'reject') {
            result = {
              ok: false,
              error:
                'USER_REJECTED: The user declined this action. Do not repeat it without a new user request.',
            };
          } else {
            await this.transport.start(turn.id, event.callId, controller.signal);
            const index = turn.actions.findIndex((item) => item.id === event.callId);
            turn.actions[index] = { ...turn.actions[index], status: 'running' };
            publish();
            result = await tools.execute(event.name, event.arguments);
          }
          results.set(event.callId, result);
          controller.signal.throwIfAborted();
          const index = turn.actions.findIndex((item) => item.id === event.callId);
          turn.actions[index] = {
            ...turn.actions[index],
            status: decision === 'reject' ? 'rejected' : result.ok ? 'completed' : 'failed',
            endedAt: Date.now(),
            result,
          };
          publish();
        }
        await this.transport.reply(turn.id, event.callId, result, controller.signal);
      }
    };
    try {
      publish();
      const durableContext = this.ports.context
        ? await this.ports.context(controller.signal)
        : undefined;
      controller.signal.throwIfAborted();
      if (!current()) throw new Error('Agent session ownership changed');
      const context = JSON.stringify({
        durableContext,
        notebookId: this.notebookId,
        cells: tools.index(),
        summary: data.summary,
        recentConversation: data.turns.slice(-7, -1).map((item) => ({
          prompt: item.prompt.slice(0, 4000),
          answer: item.answer.slice(-8000),
          status: item.status,
        })),
      });
      await this.transport.run(
        {
          notebookId: this.notebookId,
          cellId: this.cellId,
          provider: data.provider,
          role: data.role ?? 'worker',
          sessionId,
          runId: turn.id,
          prompt: turn.prompt,
          context,
        },
        controller.signal,
        receive
      );
      controller.signal.throwIfAborted();
      this.transition('completed');
    } catch (error) {
      if (controller.signal.aborted) {
        if (this.phase === 'running') this.transition('cancelling');
        this.transition('cancelled');
      } else {
        this.transition('failed');
        turn.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      turn.actions = turn.actions.map((action) =>
        ['running', 'waiting'].includes(action.status)
          ? {
              ...action,
              endedAt: Date.now(),
              status: this.phase === 'cancelled' ? 'cancelled' : 'failed',
            }
          : action
      );
      turn.status = this.phase;
      turn.endedAt = Date.now();
      try {
        publish();
      } finally {
        controller.abort();
        tools.dispose();
        watch();
        this.controller = undefined;
        this.currentTurnId = undefined;
      }
    }
  }
}
