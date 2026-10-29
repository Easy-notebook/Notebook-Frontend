// src/components/Notebook/hooks/useLibraryHandlers.ts
// Custom hook for library-related handlers

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../UI/Toast';
import { uiLog } from '@Utils/logger';

export const useLibraryHandlers = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleLibrarySelectNotebook = useCallback(
    async (
      notebookId: string,
      notebookTitle: string,
      navigateToWorkspace: (notebookId: string) => void
    ) => {
      try {
        navigateToWorkspace(notebookId);

        toast({
          message: t('toast.notebookSelected', `Notebook "${notebookTitle}" selected`),
          type: 'success',
        } as any);
      } catch (err) {
        uiLog.error('Error selecting notebook', { error: err });
        toast({
          message: (err as Error).message || t('toast.error'),
          type: 'error',
        } as any);
      }
    },
    [toast, t]
  );

  const handleLibraryBack = useCallback((navigateToEmpty: () => void) => {
    navigateToEmpty();
  }, []);

  return {
    handleLibrarySelectNotebook,
    handleLibraryBack,
  };
};
