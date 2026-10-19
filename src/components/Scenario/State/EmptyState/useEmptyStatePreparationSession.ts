import { useLayoutEffect, useMemo } from 'react';
import useStore from '@Store/notebookStore';
import { EmptyStatePreparationSession } from './EmptyStatePreparationSession';

export function useEmptyStatePreparationSession(): EmptyStatePreparationSession {
  const session = useMemo(() => new EmptyStatePreparationSession(), []);
  useLayoutEffect(() => {
    session.attach();
    const unsubscribe = useStore.subscribe((state, previous) => {
      // Creating the first notebook is part of upload admission.
      if (previous.notebookId !== null && state.notebookId !== previous.notebookId)
        session.cancel();
    });
    return () => {
      unsubscribe();
      session.detach();
    };
  }, [session]);
  return session;
}
