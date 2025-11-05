// WorkspaceHeader.tsx
// Header component for Workspace view - supports notebook editing and execution

import { useTranslation } from 'react-i18next';
import { Play, Upload, BarChartHorizontalBig, TerminalSquare } from 'lucide-react';
import ModeToggle from '../MainContainer/ModeToggle';
import ExportToFile from '../FunctionBar/ExportToFile';

interface WorkspaceHeaderProps {
  viewMode: string;
  isCollapsed: boolean;
  cells: any[];
  isExecuting: boolean;
  isRightSidebarCollapsed: boolean;
  onModeChange: (mode: string) => void;
  onRunAll: () => void;
  onExportJson: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  onTriggerFileInput: () => void;
  onHandleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onShowCommandInput: () => void;
  onToggleRightSidebar: () => void;
  onOpenSettings: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  viewMode,
  cells,
  isExecuting,
  onModeChange,
  onRunAll,
  onExportJson,
  onExportDocx,
  onExportPdf,
  onExportMarkdown,
  onTriggerFileInput,
  onHandleImport,
  onShowCommandInput,
  onToggleRightSidebar,
  fileInputRef,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full h-18 mt-2 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <ModeToggle viewMode={viewMode} onModeChange={onModeChange} />
      </div>

      <div className="flex items-center gap-2">
        {!(cells.length === 0 || viewMode === 'dslc') && (
          <>
            <button
              onClick={onRunAll}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20"
              disabled={cells.length === 0 || isExecuting}
            >
              <Play size={16} />
              <span className="hidden sm:inline">
                {isExecuting ? t('fileOperations.running') : t('fileOperations.runAll')}
              </span>
            </button>

            <ExportToFile
              disabled={cells.length === 0}
              onExportJson={onExportJson}
              onExportDocx={onExportDocx}
              onExportPdf={onExportPdf}
              onExportMarkdown={onExportMarkdown}
            />
          </>
        )}

        <button
          onClick={onTriggerFileInput}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105 text-gray-700 dark:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
        >
          <Upload size={16} />
          <span className="hidden sm:inline">{t('fileOperations.import')}</span>
        </button>

        <input
          type="file"
          accept=".ipynb,application/json"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={onHandleImport}
        />

        <div className="flex items-center gap-1">
          {!(cells.length === 0 || viewMode === 'dslc') && (
            <button
              className="flex items-center gap-2 p-2 rounded-lg transition-all duration-200 hover:scale-105 text-primary hover:bg-primary/10"
              onClick={onShowCommandInput}
            >
              <TerminalSquare size={18} />
            </button>
          )}
          <button
            onClick={onToggleRightSidebar}
            className="flex items-center gap-2 p-2 rounded-lg transition-all duration-200 hover:scale-105 text-primary bg-primary/10 hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20"
          >
            <BarChartHorizontalBig size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

WorkspaceHeader.displayName = 'WorkspaceHeader';

export default WorkspaceHeader;
