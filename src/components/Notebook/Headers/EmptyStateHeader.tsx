// EmptyStateHeader.tsx
// Header component for Empty state - includes import functionality

import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';

interface EmptyStateHeaderProps {
  onTriggerFileInput?: () => void;
  onHandleImport?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSettings?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement>;
}

const EmptyStateHeader: React.FC<EmptyStateHeaderProps> = ({
  onTriggerFileInput,
  onHandleImport,
  fileInputRef,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full h-14 flex items-center justify-end px-4">
      {onTriggerFileInput && onHandleImport && fileInputRef && (
        <div className="flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
};

EmptyStateHeader.displayName = 'EmptyStateHeader';

export default EmptyStateHeader;
