import { useSyncExternalStore } from 'react';
import useStore from '@Store/notebookStore';
import { agentWriting } from './AgentWriting';
export function useAgentWriting(cellId: string) {
  const notebookId = useStore((state) => state.notebookId);
  const operations = useSyncExternalStore(
    agentWriting.subscribe,
    agentWriting.snapshot,
    agentWriting.snapshot
  );
  return operations.find((item) => item.notebookId === notebookId && item.cellId === cellId);
}
