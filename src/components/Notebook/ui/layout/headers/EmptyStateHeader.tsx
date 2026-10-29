// EmptyStateHeader.tsx (moved to ui/layout/headers)
// Header component for Empty state - includes import functionality

import { useTranslation } from 'react-i18next';
import { Upload, BarChartHorizontalBig } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import { CreateHousingStudyButton } from '../../../features/native-study/CreateHousingStudyButton';

interface EmptyStateHeaderProps {
  onTriggerFileInput?: () => void;
  onHandleImport?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSettings?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  onToggleRightSidebar: () => void;
}

const EmptyStateHeader: React.FC<EmptyStateHeaderProps> = ({
  onTriggerFileInput,
  onHandleImport,
  fileInputRef,
  onToggleRightSidebar,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full h-full flex items-center justify-end px-2">
      <CreateHousingStudyButton />
      {onTriggerFileInput && onHandleImport && fileInputRef && (
        <div className="flex items-center gap-2">
          <button
            onClick={onTriggerFileInput}
            className="app-chrome-button app-chrome-button--label"
          >
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
          <button
            onClick={onToggleRightSidebar}
            aria-label="Toggle right sidebar"
            className="app-chrome-button"
          >
            <BarChartHorizontalBig className="app-navigation-icon" />
          </button>
        </div>
      )}
    </div>
  );
};

EmptyStateHeader.displayName = 'EmptyStateHeader';

export default EmptyStateHeader;
