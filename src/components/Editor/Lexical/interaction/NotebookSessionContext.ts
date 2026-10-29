import { createContext, useContext } from 'react';
import type { NotebookEditorSession } from './NotebookEditorSession';

/** Stable context identity, independent of hot-reloaded plugin components. */
export const NotebookSessionContext = createContext<NotebookEditorSession | null>(null);
export function useNotebookEditorSession() {
  const session = useContext(NotebookSessionContext);
  if (!session) throw new Error('Notebook session is missing');
  return session;
}
