import { useAgentWriting } from '@Services/agent-writing/useAgentWriting';
import { createContext, useContext } from 'react';

/** Runtime view policy, not persisted cell data. React portals retain this context. */
export const EditorReadOnlyContext = createContext(false);
export const useEditorReadOnly = () => useContext(EditorReadOnlyContext);

/** Shared policy for embedded editors, detached views and their mutation controls. */
export function useCellEditAccess(cellId: string) {
  const viewReadOnly = useEditorReadOnly();
  const writing = useAgentWriting(cellId);
  return { viewReadOnly, writing, readOnly: viewReadOnly || !!writing };
}
