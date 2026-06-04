// src/App.tsx
import { ConfigProvider } from 'antd';
import { useEffect } from 'react';
import AppRouter from './router/AppRouter';
import { getAntdTheme } from './theme/antdTheme';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { initializeWorkflowSystem } from './components/Scenario/Workflow/utils/workflowInitializer';
import { PersistenceProvider } from './services/persistence/PersistenceContext';
import { AgentMemoryService } from './services/agentMemoryService';
import { initializePreviewStoreForBrowser } from './store/previewStore';
import { Toaster } from '@/components/UI/sonner';
import { NotebookBackgroundLayers } from './components/Notebook/ui/NotebookBackgroundLayers';

function AppContent(): JSX.Element {
  const { resolvedTheme } = useTheme();
  const antdTheme = getAntdTheme(resolvedTheme === 'dark');

  useEffect(() => {
    initializePreviewStoreForBrowser();
    AgentMemoryService.loadFromStorage();

    // Initialize workflow system on app startup
    console.log('[App] Initializing workflow system...');
    try {
      initializeWorkflowSystem();
      console.log('[App] Workflow system initialized successfully');
    } catch (error) {
      console.error('[App] Failed to initialize workflow system:', error);
    }

    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <ConfigProvider theme={antdTheme}>
      <NotebookBackgroundLayers />
      <AppRouter />
      <Toaster position="top-right" />
    </ConfigProvider>
  );
}

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <PersistenceProvider>
        <AppContent />
      </PersistenceProvider>
    </ThemeProvider>
  );
}

export default App;
