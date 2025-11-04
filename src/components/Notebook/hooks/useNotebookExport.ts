// src/components/Notebook/hooks/useNotebookExport.ts
// Custom hook for notebook export functionality

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@Store/notebookStore';
import { createExportHandlers } from '@Utils/exportToFile/exportUtils';
import { useToast } from '../../UI/Toast';
import { uiLog } from '@Utils/logger';

export const useNotebookExport = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { notebookId, cells, tasks } = useStore();

  // JSON export handler
  const handleExportJson = useCallback(async () => {
    try {
      const exportData = {
        notebook_id: notebookId,
        cells,
        tasks,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notebook-${notebookId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        message: t('toast.exportSuccess'),
        type: 'success',
      } as any);
    } catch (err) {
      uiLog.error('Error exporting notebook', { error: err });
      toast({
        message: t('toast.exportFailed'),
        type: 'error',
      } as any);
    }
  }, [notebookId, cells, tasks, toast, t]);

  // Get other export handlers
  const { exportDocx, exportPdf, exportMarkdown } = createExportHandlers(
    cells as any,
    tasks as any
  );

  return {
    handleExportJson,
    exportDocx,
    exportPdf,
    exportMarkdown,
  };
};
