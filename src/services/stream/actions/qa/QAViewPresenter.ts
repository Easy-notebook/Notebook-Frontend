import useNotebookStore from '@Store/notebookStore';

/** Owns the shared sidebar/view publication sequence for streaming answers. */
export class QAViewPresenter {
  static async show(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    try {
      const notebook = useNotebookStore.getState();
      if (notebook.isRightSidebarCollapsed) notebook.setIsRightSidebarCollapsed(false);
      signal?.throwIfAborted();
      const { useAIAgentStore } = await import('@Store/AIAgentStore');
      signal?.throwIfAborted();
      const agent = useAIAgentStore.getState();
      if (agent.activeView !== 'qa') agent.setActiveView('qa');
      signal?.throwIfAborted();
    } catch (error) {
      signal?.throwIfAborted();
      console.error('Failed to show streaming QA view:', error);
    }
  }
}
