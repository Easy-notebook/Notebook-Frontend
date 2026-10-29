import { useEffect, useState } from 'react';
import useStore from '@Store/notebookStore';
import { NotebookFileSync } from '@Services/notebook/NotebookFileSync';
/** Document lifetime owns native synchronization; closing the file panel does not stop writes. */
export function useNativeNotebookFiles(ready: boolean) {
  const id = useStore((state) => state.notebookId);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (!ready || !id) return;
    const session = new NotebookFileSync(
      id,
      () => {
        setError(null);
        window.dispatchEvent(new Event('refreshFileList'));
      },
      setError
    );
    void session.start();
    return () => session.stop();
  }, [ready, id]);
  return error;
}
