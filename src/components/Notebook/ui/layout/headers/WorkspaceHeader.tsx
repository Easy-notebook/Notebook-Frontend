// WorkspaceHeader.tsx (moved to ui/layout/headers)
// Header component for Workspace view - supports notebook editing and execution

import { useTranslation } from 'react-i18next';
import { Upload, BarChartHorizontalBig } from 'lucide-react';
import ModeToggle from './ModeToggle';
import { RunAllButton } from './RunAllButton';
import ExportToFile from '../../../features/function-bar/ExportToFile';
import NotificationCenter from './NotificationCenter';
import type { Cell } from '@Store/models';

interface WorkspaceHeaderProps {
  viewMode: string;
  isCollapsed: boolean;
  cells: Cell[];
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
  onToggleRightSidebar,
  fileInputRef,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full h-full flex items-center justify-between px-2">
      <div className="flex items-center gap-3">
        <ModeToggle viewMode={viewMode} onModeChange={onModeChange} />
      </div>

      <div className="flex items-center gap-2">
        {!(cells.length === 0 || viewMode === 'dslc') && (
          <>
            <RunAllButton
              onRunAll={onRunAll}
              isExecuting={isExecuting}
              empty={cells.length === 0}
            />

            <ExportToFile
              disabled={cells.length === 0}
              onExportJson={onExportJson}
              onExportDocx={onExportDocx}
              onExportPdf={onExportPdf}
              onExportMarkdown={onExportMarkdown}
            />
          </>
        )}

        <button onClick={onTriggerFileInput} className="app-chrome-button app-chrome-button--label">
          <Upload className="app-navigation-icon" />
          <span className="hidden sm:inline">{t('fileOperations.import')}</span>
        </button>

        <input
          type="file"
          accept=".easynb,.ipynb,.json,.txt,application/json,text/plain"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={onHandleImport}
        />
        <NotificationCenter />

        <div className="flex items-center gap-1">
          <button
            onClick={onToggleRightSidebar}
            aria-label="Toggle right sidebar"
            className="app-chrome-button"
          >
            <BarChartHorizontalBig className="app-navigation-icon" />
          </button>
        </div>
      </div>
    </div>
  );
};

WorkspaceHeader.displayName = 'WorkspaceHeader';

export default WorkspaceHeader;
