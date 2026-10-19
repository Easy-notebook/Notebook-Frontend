import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { CommandDraft } from '@Services/ai-terminal/CommandDraft';

export function useCommandDraft(notebookId: string | null) {
  const draft = useMemo(() => new CommandDraft(), []);
  const previousNotebook = useRef(notebookId);
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  useLayoutEffect(() => {
    draft.attach();
    return () => draft.detach();
  }, [draft]);
  useLayoutEffect(() => {
    if (previousNotebook.current !== null && previousNotebook.current !== notebookId) draft.reset();
    previousNotebook.current = notebookId;
  }, [draft, notebookId]);
  return {
    commandDraft: draft,
    input: state.value,
    setInput: draft.setValue,
    isSubmitting: state.pending,
  };
}
