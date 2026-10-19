import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { FileListSession } from '@Services/notebook/FileListSession';

export function useNotebookFileList(notebookId: string) {
  const session = useMemo(() => new FileListSession(notebookId), [notebookId]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => {
    session.attach();
    void session.refresh();
    return () => session.detach();
  }, [session]);
  return { state, refresh: session.refresh };
}
