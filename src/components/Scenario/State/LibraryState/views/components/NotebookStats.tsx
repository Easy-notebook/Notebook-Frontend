// LibraryState/NotebookStats.tsx
// Notebook statistics display component

import React, { memo } from 'react';
import { formatSize } from '../../utils';
import type { NotebookStatsProps } from '../../types';

import { FileText, Database, Eye } from 'lucide-react';

const NotebookStats: React.FC<NotebookStatsProps> = memo(
  ({ fileCount = 0, accessCount = 0, totalSize }) => (
    <div className="flex flex-wrap gap-2 mt-2">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-blue-200/60 dark:border-blue-800/60 text-xs font-medium text-blue-700 dark:text-blue-300 shadow-sm">
        <FileText className="w-3 h-3" />
        <span>{fileCount} files</span>
      </div>

      {totalSize !== undefined && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-emerald-200/60 dark:border-emerald-800/60 text-xs font-medium text-emerald-700 dark:text-emerald-300 shadow-sm">
          <Database className="w-3 h-3" />
          <span>{formatSize(totalSize)}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-violet-200/60 dark:border-violet-800/60 text-xs font-medium text-violet-700 dark:text-violet-300 shadow-sm">
        <Eye className="w-3 h-3" />
        <span>{accessCount} visits</span>
      </div>
    </div>
  )
);

NotebookStats.displayName = 'NotebookStats';

export default NotebookStats;
