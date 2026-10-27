// moved to features/viewers/pdf
import React from 'react';

interface PDFDisplayProps {
  dataUrl: string; // data:application/pdf;base64,...
  fileName?: string | null;
}

const PDFDisplay: React.FC<PDFDisplayProps> = ({ dataUrl, fileName }) => {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
          {fileName || 'PDF Preview'}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={dataUrl}
            download={fileName || 'document.pdf'}
            className="text-xs px-2 py-1 rounded bg-theme-50 dark:bg-theme-900/30 text-theme-700 dark:text-theme-300 hover:bg-theme-100 dark:hover:bg-theme-900/50"
          >
            Download
          </a>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        <iframe title={fileName || 'PDF'} src={dataUrl} className="w-full h-full" />
      </div>
    </div>
  );
};

export default PDFDisplay;
