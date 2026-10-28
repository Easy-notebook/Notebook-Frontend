import { useEffect, useMemo, type ReactNode } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import useStore from '@Store/notebookStore';
import { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import { NotebookSessionContext } from '../interaction/NotebookSessionContext';
export function NotebookSessionPlugin({ children }: { children: ReactNode }) {
  const [editor] = useLexicalComposerContext();
  const notebookId = useStore((state) => state.notebookId);
  const session = useMemo(
    () => new NotebookEditorSession(editor, notebookId),
    [editor, notebookId]
  );
  useEffect(() => session.attach(), [session]);
  return (
    <NotebookSessionContext.Provider value={session}>{children}</NotebookSessionContext.Provider>
  );
}
