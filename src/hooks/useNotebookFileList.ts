import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { FileListSession } from '@Services/notebook/FileListSession';

export function useNotebookFileList(notebookId: string) {
  const session = useMemo(() => new FileListSession(notebookId), [notebookId]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => {
    session.attach();
    void session.refresh();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (document.visibilityState !== 'hidden') await session.refresh(true);
      if (active) timer = setTimeout(check, 2000);
    };
    timer = setTimeout(check, 2000);
    const focus = () => void session.refresh(true);
    window.addEventListener('focus', focus);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', focus);
      session.detach();
    };
  }, [session]);
  const refresh = useCallback(() => session.refresh(), [session]);
  return { state, refresh };
}
