import React, { useState } from 'react';
import { Download, FileDown, FileJson, FileType, FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExportToFileProps {
  disabled?: boolean;
  onExportJson: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
}

const ExportToFile: React.FC<ExportToFileProps> = ({
  disabled = false,
  onExportJson,
  onExportDocx,
  onExportPdf,
  onExportMarkdown,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleExport = (callback: () => void) => {
    callback();
    closeModal();
  };

  return (
    <>
      <button
        onClick={openModal}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        title={t('fileOperations.export')}
      >
        <Download size={18} />
        <span className="hidden sm:inline">{t('fileOperations.export')}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={closeModal}
          />

          {/* Modal Content */}
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all scale-100 opacity-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Download className="w-5 h-5" />
                {t('fileOperations.export')}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 grid grid-cols-1 gap-3">
              <ExportOption
                icon={FileJson}
                label={t('exportOptions.exportToJSON')}
                description="Export as raw JSON data"
                onClick={() => handleExport(onExportJson)}
              />
              <ExportOption
                icon={FileType}
                label={t('exportOptions.exportToDocx')}
                description="Export as Microsoft Word document"
                onClick={() => handleExport(onExportDocx)}
              />
              <ExportOption
                icon={FileDown}
                label={t('exportOptions.exportToPDF')}
                description="Export as PDF document"
                onClick={() => handleExport(onExportPdf)}
              />
              <ExportOption
                icon={FileText}
                label={t('exportOptions.exportToMarkdown')}
                description="Export as Markdown file"
                onClick={() => handleExport(onExportMarkdown)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface ExportOptionProps {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
}

const ExportOption: React.FC<ExportOptionProps> = ({ icon: Icon, label, description, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-4 w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-theme-500 dark:hover:border-theme-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
  >
    <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-theme-100 dark:group-hover:bg-theme-900/30 text-gray-600 dark:text-gray-300 group-hover:text-theme-600 dark:group-hover:text-theme-400 transition-colors">
      <Icon size={24} />
    </div>
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-theme-600 dark:group-hover:text-theme-400 transition-colors">
        {label}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  </button>
);

export default ExportToFile;
