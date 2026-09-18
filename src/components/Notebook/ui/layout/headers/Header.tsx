import { useTranslation } from 'react-i18next';
import { Play, Upload, BarChartHorizontalBig } from 'lucide-react';
import ModeToggle from './ModeToggle';
import ExportToFile from '../../../features/function-bar/ExportToFile';
import NotificationCenter from './NotificationCenter';
import type { Cell } from '@Store/models';

interface HeaderProps {
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

const Header: React.FC<HeaderProps> = ({
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
    <div className="h-16 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <ModeToggle viewMode={viewMode} onModeChange={onModeChange} />
      </div>

      <div className="flex items-center gap-2">
        {!(cells.length === 0 || viewMode === 'dslc') && (
          <>
            <button
              onClick={onRunAll}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-slate-100/80 rounded-md transition-all duration-200 text-slate-700 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium hover:bg-slate-100/80 rounded-md transition-all duration-200 text-slate-700 hover:text-slate-800"
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
          <button
            onClick={onToggleRightSidebar}
            className="flex items-center gap-2 p-2 hover:bg-slate-100/80 rounded-md transition-all duration-200 text-emerald-600 hover:text-emerald-700 bg-emerald-50/60"
          >
            <BarChartHorizontalBig size={18} />
          </button>
          <NotificationCenter />
        </div>
      </div>
    </div>
  );
};

export default Header;
