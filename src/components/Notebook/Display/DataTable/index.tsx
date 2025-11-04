import React, { useState } from 'react';
import Analysis from './Analysis';
import DataTable from './DataTable';
import { FileSpreadsheet, BarChart3} from 'lucide-react';

interface CSVPreviewWrapperProps {
  typeOverride?: 'csv' | 'xlsx';
  virtualizationThreshold?: number;
  showColumnLetters?: boolean;
}

type ViewMode = 'office' | 'advanced';

const CSVPreviewWrapper: React.FC<CSVPreviewWrapperProps> = (props) => {
  // Get saved preference from localStorage, default to 'office'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('csv-preview-mode');
    return (saved === 'advanced' || saved === 'office') ? saved : 'office';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('csv-preview-mode', mode);
  };

  return (
    <div className="h-full flex flex-col">
      {/* View Mode Switcher */}
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">View Mode:</span>
          <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 p-1">
            <button
              onClick={() => handleViewModeChange('office')}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                ${viewMode === 'office' 
                  ? 'bg-theme-600 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }
              `}
              title="Office-style spreadsheet view with Excel-like interface"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Data
            </button>
            <button
              onClick={() => handleViewModeChange('advanced')}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                ${viewMode === 'advanced' 
                  ? 'bg-theme-600 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }
              `}
              title="Advanced view with analytics, virtual scrolling, and multi-table support"
            >
              <BarChart3 className="w-4 h-4" />
              Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'office' ? (
          <DataTable {...props} />
        ) : (
          <Analysis {...props} />
        )}
      </div>
    </div>
  );
};

export default CSVPreviewWrapper;
