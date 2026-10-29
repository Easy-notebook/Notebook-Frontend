import { useEffect } from 'react';
import useStore from '@Store/notebookStore';
import {
  notebookAgentProfiles,
  useNotebookAgentProfiles,
} from '@Services/agent-cell/NotebookAgentIdentity';
import { resolveNotebookAgent } from '@Services/agent-cell/NotebookConversation';
export function useNotebookAgentIdentity(notebookId: string) {
  const owner = useStore((s) => s.notebookId);
  const cells = useStore((s) => s.cells);
  const entry = useNotebookAgentProfiles((s) => s.entries[notebookId]);
  useEffect(() => {
    if (notebookId && owner === notebookId)
      void notebookAgentProfiles.load(notebookId).catch(() => {});
  }, [notebookId, owner]);
  const identity = owner === notebookId ? entry?.identity : undefined;
  return {
    identity,
    error: entry?.error,
    cell: identity ? resolveNotebookAgent(cells, identity.agentId) : undefined,
  };
}
