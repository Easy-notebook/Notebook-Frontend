import React, { useEffect } from 'react';
import { ConfigProvider } from 'antd';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { getAntdTheme } from '@/theme/antdTheme';
import { PersistenceProvider } from '@/services/persistence/PersistenceContext';
import { initializeWorkflowSystem } from '@/components/Scenario/Workflow/utils/workflowInitializer';
import { Toaster } from '@/components/UI/sonner';
import { NotebookBackgroundLayers } from '@/components/Notebook/ui/NotebookBackgroundLayers';
import { initializePreviewStoreForBrowser } from '@/store/previewStore';
import { AgentMemoryService } from '@/services/agentMemoryService';

export interface NotebookRuntimeProviderProps {
  children: React.ReactNode;
  showBackground?: boolean;
  showToaster?: boolean;
}

const NotebookRuntimeContent: React.FC<NotebookRuntimeProviderProps> = ({
  children,
  showBackground = true,
  showToaster = true,
}) => {
  const { resolvedTheme } = useTheme();
  const antdTheme = getAntdTheme(resolvedTheme === 'dark');

  useEffect(() => {
    initializePreviewStoreForBrowser();
    AgentMemoryService.loadFromStorage();

    try {
      initializeWorkflowSystem();
    } catch (error) {
      console.error('[EasyNotebook] Failed to initialize workflow system:', error);
    }
  }, []);

  return (
    <ConfigProvider theme={antdTheme}>
      {showBackground && <NotebookBackgroundLayers />}
      {children}
      {showToaster && <Toaster position="top-right" />}
    </ConfigProvider>
  );
};

export const NotebookRuntimeProvider: React.FC<NotebookRuntimeProviderProps> = (props) => (
  <ThemeProvider>
    <PersistenceProvider>
      <NotebookRuntimeContent {...props} />
    </PersistenceProvider>
  </ThemeProvider>
);
