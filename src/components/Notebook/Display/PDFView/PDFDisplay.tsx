import React from 'react';
import { Minimize2, Maximize2, Split } from 'lucide-react';
import useStore from '../../../../store/notebookStore';

interface PDFDisplayProps {
  dataUrl: string; // data:application/pdf;base64,...
  fileName?: string | null;
}

const PDFDisplay: React.FC<PDFDisplayProps> = ({ dataUrl, fileName }) => {
  const setDetachedCellId = useStore(s => s.setDetachedCellId);
  const isDetachedCellFullscreen = useStore(s => s.isDetachedCellFullscreen);
  const toggleDetachedCellFullscreen = useStore(s => s.toggleDetachedCellFullscreen);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white/70">
        <div className="text-sm font-medium text-gray-700 truncate">{fileName || 'PDF Preview'}</div>
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
            className="text-xs px-2 py-1 rounded bg-theme-50 text-theme-700 hover:bg-theme-100"
          >
            Download
          </a>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        <iframe
          title={fileName || 'PDF'}
          src={dataUrl}
          className="w-full h-full"
        />
      </div>
    </div>
  );
};

export default PDFDisplay;

