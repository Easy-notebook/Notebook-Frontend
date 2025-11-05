import React, { useState } from 'react';
import { ChevronDown, Download, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const VUE_PRIMARY = '#41B883';
const VUE_SECONDARY = '#35495E';

const ExportToFile = ({
  disabled = false,
  onExportJson,
  onExportDocx,
  onExportPdf,
  onExportMarkdown,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200"
      >
        <Download size={16} />
        {t('fileOperations.export')}
        <ChevronDown size={16} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 py-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-10 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              onExportJson();
              setIsOpen(false);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <FileDown size={16} />
            {t('exportOptions.exportToJSON')}
          </button>
          <button
            onClick={() => {
              onExportDocx();
              setIsOpen(false);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <FileDown size={16} />
            {t('exportOptions.exportToDocx')}
          </button>
          <button
            onClick={() => {
              onExportPdf();
              setIsOpen(false);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <FileDown size={16} />
            {t('exportOptions.exportToPDF')}
          </button>
          <button
            onClick={() => {
              onExportMarkdown();
              setIsOpen(false);
            }}
            className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <FileDown size={16} />
            {t('exportOptions.exportToMarkdown')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportToFile;
