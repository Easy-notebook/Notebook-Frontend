import { notebookContextService } from '../notebook-context/instance';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { AgentCellSession, type AgentSessionPorts } from './AgentCellSession';
import { HttpAgentTransport } from './AgentTransport';
import { newAgentCellData, type AgentCellData, type AgentProvider } from './protocol';

class AgentCellService {
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
    state.updateCellMetadata(cellId, { agent: newAgentCellData(provider, role) });
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
  async send(cellId: string, prompt: string) {
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
      await session.send(prompt);
    } finally {
      if (this.sessions.get(key) === session) this.sessions.delete(key);
    }
  }
}
export const agentCellService = new AgentCellService();
