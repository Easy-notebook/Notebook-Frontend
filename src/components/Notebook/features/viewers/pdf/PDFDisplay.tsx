// moved to features/viewers/pdf
import React from 'react';
import { Minimize2, Maximize2, Split } from 'lucide-react';
import useStore from '@Store/notebookStore';

interface PDFDisplayProps {
  dataUrl: string; // data:application/pdf;base64,...
  fileName?: string | null;
}

const PDFDisplay: React.FC<PDFDisplayProps> = ({ dataUrl, fileName }) => {
  const setDetachedCellId = useStore((s) => s.setDetachedCellId);
  const isDetachedCellFullscreen = useStore((s) => s.isDetachedCellFullscreen);
  const toggleDetachedCellFullscreen = useStore((s) => s.toggleDetachedCellFullscreen);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
          {fileName || 'PDF Preview'}
        </div>
        <div className="flex items-center gap-2">
          {/* <button
            onClick={toggleDetachedCellFullscreen}
            className="p-1.5 hover:bg-gray-200 rounded"
            title={isDetachedCellFullscreen ? "Switch to split view" : "Switch to fullscreen"}
          >
            {isDetachedCellFullscreen ? <Split size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={() => setDetachedCellId(null)}
            className="p-1.5 hover:bg-red-200 rounded text-red-600"
            title="Close preview"
          >
            <Minimize2 size={16} />
          </button> */}
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
