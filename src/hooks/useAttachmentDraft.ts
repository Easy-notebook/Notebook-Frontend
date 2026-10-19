import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AttachmentDraft } from '@Services/ai-terminal/AttachmentDraft';

export function useAttachmentDraft(notebookId: string | null) {
  const draft = useMemo(() => new AttachmentDraft(), []);
  const previousNotebook = useRef(notebookId);
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  useLayoutEffect(() => {
    draft.attach();
    return () => draft.detach();
  }, [draft]);
  useLayoutEffect(() => {
    // Initial attachment admission may create the first notebook itself.
    if (previousNotebook.current !== null && previousNotebook.current !== notebookId) draft.reset();
    previousNotebook.current = notebookId;
  }, [draft, notebookId]);
  return { draft, files: state.files, isUploading: state.uploading > 0 };
}
