import { useAIAgentStore } from '@Store/AIAgentStore';
import { notebookAgentProfiles } from './NotebookAgentIdentity';
import { create } from 'zustand';
import useStore from '@Store/notebookStore';
import { agentCellService } from './agentCellService';
import { newAgentCellData } from './protocol';

/** View selection only; conversation content and execution belong to the notebook cell. */
export const useNotebookConversation = create<{
  selected: Record<string, string>;
  select: (notebookId: string, cellId: string) => void;
}>((set) => ({
  selected: {},
  select: (notebookId, cellId) =>
    set((state) => ({
      selected: { ...state.selected, [notebookId]: cellId },
    })),
}));

/** One destination for chat, approvals and execution details. */
export function showNotebookConversation(notebookId: string, cellId: string) {
  useNotebookConversation.getState().select(notebookId, cellId);
  useAIAgentStore.getState().setActiveView('qa');
  useStore.getState().setIsRightSidebarCollapsed(false);
}

/** The notebook terminal always addresses its own agent, never the selected worker. */
export function resolveNotebookAgent(
  cells: ReturnType<typeof useStore.getState>['cells'],
  agentId: string,
  sourceSessionId?: string
) {
  return cells.find(
    (cell) =>
      cell.type === 'agent' &&
      cell.enableEdit !== false &&
      cell.metadata?.agent?.notebookAgentId === agentId &&
      cell.metadata?.agent?.sourceSessionId === sourceSessionId
  );
}

export const notebookConversation = {
  async submit(
    notebookId: string,
    prompt: string,
    onError: (error: unknown) => void
  ): Promise<boolean> {
    if (!notebookId || useStore.getState().notebookId !== notebookId)
      throw new Error('请先打开 notebook');
    if (!prompt.trim()) return false;
    const profile = await notebookAgentProfiles.load(notebookId);
    const state = useStore.getState();
    if (state.notebookId !== notebookId) throw new Error('Notebook 已切换，请重新发送');
    const current = resolveNotebookAgent(state.cells, profile.agentId, profile.source?.sessionId);
    if (current && agentCellService.isActive(notebookId, current.id))
      throw new Error('Agent 正在回答，请等待完成或先取消');
    if (current && current.metadata?.agent?.provider !== profile.provider) {
      agentCellService.configure(current.id, profile.provider);
    }
    const cellId =
      current?.id ??
      state.addCell({
        type: 'agent',
        content: '',
        metadata: {
          agent: {
            ...newAgentCellData(profile.provider),
            notebookAgentId: profile.agentId,
            sourceSessionId: profile.source?.sessionId,
          },
        },
      });
    showNotebookConversation(notebookId, cellId);
    void agentCellService.send(cellId, prompt).catch(onError);
    return true;
  },
};
