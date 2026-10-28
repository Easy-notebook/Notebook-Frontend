import { useEffect } from 'react';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { registerNotebookMarkdownInput } from './NotebookMarkdownInput';
export function NotebookMarkdownInputPlugin() {
  const session = useNotebookEditorSession();
  useEffect(() => registerNotebookMarkdownInput(session.editor), [session]);
  return null;
}
