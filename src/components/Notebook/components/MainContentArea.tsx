// src/components/Notebook/components/MainContentArea.tsx
// Main content area with header and content

import { useRef } from 'react';
import Header from '../MainContainer/Header';
import GlobalTabList from '../Display/GlobalTabList';
import ErrorAlert from '../../UI/ErrorAlert';
import CommandInputOrig from '../FunctionBar/AITerminal';
import { useAIAgentStore } from '@Store/AIAgentStore';

// Cast component to any to relax prop type constraints
const CommandInput: any = CommandInputOrig;

interface MainContentAreaProps {
  viewMode: string;
  isCollapsed: boolean;
  cells: any[];
  isExecuting: boolean;
  isRightSidebarCollapsed: boolean;
  error: string | null;
  children: React.ReactNode;
  onModeChange: (mode: any) => void;
  onRunAll: () => Promise<void>;
  onExportJson: () => Promise<void>;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  onHandleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleRightSidebar: () => void;
  onOpenSettings: () => void;
  onSetError: (error: string | null) => void;
}

export const MainContentArea = ({
  viewMode,
  isCollapsed,
  cells,
  isExecuting,
  isRightSidebarCollapsed,
  error,
  children,
  onModeChange,
  onRunAll,
  onExportJson,
  onExportDocx,
  onExportPdf,
  onExportMarkdown,
  onHandleImport,
  onToggleRightSidebar,
  onOpenSettings,
  onSetError,
}: MainContentAreaProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { setShowCommandInput } = useAIAgentStore();

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative m-0 p-0">
      <CommandInput onClick={() => setShowCommandInput(true)} />

      <Header
        viewMode={viewMode}
        isCollapsed={isCollapsed}
        cells={cells}
        isExecuting={isExecuting}
        isRightSidebarCollapsed={isRightSidebarCollapsed}
        onModeChange={onModeChange}
        onRunAll={onRunAll}
        onExportJson={onExportJson}
        onExportDocx={onExportDocx}
        onExportPdf={onExportPdf}
        onExportMarkdown={onExportMarkdown}
        onTriggerFileInput={triggerFileInput}
        onHandleImport={onHandleImport}
        onShowCommandInput={() => setShowCommandInput(true)}
        onToggleRightSidebar={onToggleRightSidebar}
        onOpenSettings={onOpenSettings}
        fileInputRef={fileInputRef}
      />

      <GlobalTabList />

      <div className="flex-1 overflow-y-auto scroll-smooth border-3 border-theme-200 bg-white w-full h-full">
        <div className="w-full h-full">{children}</div>
      </div>

      {error && <ErrorAlert message={error} onClose={() => onSetError(null)} />}
    </div>
  );
};
