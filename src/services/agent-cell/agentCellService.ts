import { AutoSaveService } from '../autoSave/AutoSaveService';
import type { ApprovalDecision } from './AgentApprovalGate';
import { notebookContextService } from '../notebook-context/instance';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { AgentCellSession, type AgentSessionPorts } from './AgentCellSession';
import { HttpAgentTransport } from './AgentTransport';
import { newAgentCellData, type AgentCellData, type AgentProvider } from './protocol';

export interface AgentRunTarget {
  notebookId: string;
  cellId: string;
  sessionId: string;
  turnId: string;
}
class AgentCellService {
  private owned(target: AgentRunTarget) {
    const state = useStore.getState();
    const cell = state.cells.find((cell) => cell.id === target.cellId);
    const data = cell?.metadata?.agent as AgentCellData | undefined;
    if (
      state.notebookId !== target.notebookId ||
      cell?.type !== 'agent' ||
      cell.enableEdit === false ||
      data?.sessionId !== target.sessionId
    )
      throw new Error('Agent session ownership changed');
    const turn = data.turns.find((turn) => turn.id === target.turnId);
    if (!turn) throw new Error('Agent turn is no longer available');
    return { data, turn };
  }
  resolve(target: AgentRunTarget, callId: string, decision: ApprovalDecision) {
    this.owned(target);
    const session = this.sessions.get(this.key(target.notebookId, target.cellId));
    if (!session) throw new Error('Agent run is no longer active');
    session.resolve(target.sessionId, target.turnId, callId, decision);
  }
  cancelRun(target: AgentRunTarget) {
    const { data } = this.owned(target);
    if (data.turns[data.turns.length - 1]?.id !== target.turnId)
      throw new Error('This run is no longer active');
    this.cancel(target.notebookId, target.cellId);
  }
  feedback(target: AgentRunTarget, value: 'up' | 'down', reason?: string) {
    const { data } = this.owned(target);
    if (this.isActive(target.notebookId, target.cellId))
      throw new Error('Wait for the active run to finish');
    useStore.getState().updateCellMetadata(target.cellId, {
      agent: {
        ...data,
        turns: data.turns.map((turn) =>
          turn.id === target.turnId ? { ...turn, feedback: { value, reason } } : turn
        ),
      },
    });
  }
  async regenerate(target: AgentRunTarget) {
    const { turn } = this.owned(target);
    if (this.isActive(target.notebookId, target.cellId))
      throw new Error('Wait for the active run to finish');
    await this.send(target.cellId, turn.prompt, turn.id, 'regenerate');
  }
  async retry(target: AgentRunTarget) {
    const { turn } = this.owned(target);
    if (this.isActive(target.notebookId, target.cellId))
      throw new Error('Wait for the active run to finish before retrying');
    if (
      !['failed', 'cancelled'].includes(turn.status) &&
      !turn.actions.some((action) => action.status === 'failed')
    )
      throw new Error('Only failed or cancelled work can be retried');
    await this.send(
      target.cellId,
      `重试未完成的任务。先重新读取当前 cells 和版本，保留已成功的结果，不要盲目重复已成功的操作；仍需审批的操作重新请求审批。原始请求：\n${turn.prompt}\n上次错误：${
        turn.error ||
        turn.actions
          .filter((action) => action.status === 'failed')
          .map((action) => action.name + ': ' + JSON.stringify(action.result))
          .join('\n') ||
        '用户取消'
      }`,
      target.turnId
    );
  }
  private readonly sessions = new Map<string, AgentCellSession>();
  private key(notebookId: string, cellId: string) {
    return JSON.stringify([notebookId, cellId]);
  }
  isActive(notebookId: string, cellId: string) {
    return this.sessions.get(this.key(notebookId, cellId))?.active ?? false;
  }
  cancel(notebookId: string, cellId: string) {
    this.sessions.get(this.key(notebookId, cellId))?.cancel();
  }
  configure(cellId: string, provider: AgentProvider) {
    const state = useStore.getState();
    if (state.notebookId && this.isActive(state.notebookId, cellId)) return;
    const role = state.cells.find((cell) => cell.id === cellId)?.metadata?.agent?.role ?? 'worker';
    const previous = state.cells.find((cell) => cell.id === cellId)?.metadata?.agent;
    const notebookAgentId = previous?.notebookAgentId;
    state.updateCellMetadata(cellId, {
      agent: {
        ...newAgentCellData(provider, role),
        notebookAgentId,
        sourceSessionId: previous?.sourceSessionId,
        ...(notebookAgentId ? { turns: previous.turns, summary: previous.summary } : {}),
      },
    });
  }
  async organize(provider: AgentProvider) {
    const state = useStore.getState();
    if (!state.notebookId) throw new Error('请先打开 notebook');
    const curator = state.cells.find(
      (cell) =>
        cell.type === 'agent' &&
        cell.metadata?.agent?.role === 'curator' &&
        cell.metadata.agent.provider === provider
    );
    const cellId =
      curator?.id ??
      state.addCell({
        type: 'agent',
        content: '',
        metadata: { agent: newAgentCellData(provider, 'curator') },
      });
    await this.send(
      cellId,
      '请维护本 notebook 的上下文档案。先 read_context 读取版本和目录，再读取出发点、事实与线索的完整原文；保留原始出发点，区别证据与推断，关联线索并说明未决问题，最后调用 curate_context 原子保存可读的整理结果。不要修改或运行 notebook cell。'
    );
  }
  async send(cellId: string, prompt: string, retryOf?: string, intent?: 'regenerate') {
    const state = useStore.getState();
    const notebookId = state.notebookId;
    if (!notebookId) throw new Error('请先打开或保存 notebook，再运行 Agent Cell');
    const cell = state.cells.find((item) => item.id === cellId);
    if (cell?.type !== 'agent' || cell.enableEdit === false)
      throw new Error('Agent Cell is unavailable or read-only');
    const key = this.key(notebookId, cellId);
    if (this.sessions.get(key)?.active) return;
    if (!cell.metadata?.agent) state.updateCellMetadata(cellId, { agent: newAgentCellData() });
    const ports: AgentSessionPorts = {
      document: {
        snapshot: () => {
          const state = useStore.getState();
          return {
            notebookId,
            notebookTitle: state.notebookTitle,
            cells: state.cells,
            tasks: state.tasks,
            timestamp: Date.now(),
          };
        },
        replace: (cells) => {
          const title =
            cells[0]?.type === 'markdown' ? /^# ([^\n]+)/.exec(cells[0].content)?.[1] : undefined;
          useStore.getState().setCells(cells, title ? { notebookTitle: title } : undefined);
        },
        persist: async (snapshot) => {
          const saves = AutoSaveService.getInstance();
          await saves.initialize();
          await saves.saveNow(snapshot);
        },
        artifact: async (operation, input, signal) => {
          const response = await fetch('/agent-api/notebook-files/' + operation, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Notebook file operation failed');
          return result;
        },
      },
      context: (signal) => notebookContextService.context(notebookId, signal),
      readContext: (path, signal, offset) =>
        notebookContextService.readTool(notebookId, path, signal, offset),
      curateContext: (input, signal) => notebookContextService.curate(notebookId, input, signal),
      notebookId: () => useStore.getState().notebookId,
      cells: () => useStore.getState().cells,
      watch: (listener) => useStore.subscribe(listener),
      update: (id, content) => useStore.getState().updateCell(id, content),
      run: (id) => useStore.getState().runSingleCell(id),
      cancel: (id) => useCodeStore.getState().cancelCellExecution(id),
      busy: () => {
        const code = useCodeStore.getState();
        return (
          code.batchExecution !== 'idle' ||
          Object.values(code.cellExecStates).some(
            (state) => state.isExecuting || state.isCancelling
          )
        );
      },
      load: () =>
        useStore.getState().cells.find((item) => item.id === cellId)?.metadata
          ?.agent as AgentCellData,
      save: (data) => {
        if (useStore.getState().notebookId === notebookId)
          useStore.getState().updateCellMetadata(cellId, { agent: data });
      },
      summary: (text, cellIds) => {
        ports.save({
          ...ports.load(),
          summary: { text, cellIds, updatedAt: new Date().toISOString() },
        });
      },
    };
    const session = new AgentCellSession(notebookId, cellId, ports, new HttpAgentTransport());
    this.sessions.set(key, session);
    try {
      await session.send(prompt, retryOf, intent);
    } finally {
      if (this.sessions.get(key) === session) this.sessions.delete(key);
    }
  }
}
export const agentCellService = new AgentCellService();
