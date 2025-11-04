// LibraryState/NotebookStats.tsx
// Notebook statistics display component

import React, { memo } from 'react';
import { formatSize } from './utils';
import type { NotebookStatsProps } from './types';

const NotebookStats: React.FC<NotebookStatsProps> = memo(({ 
  fileCount = 0, 
  accessCount = 0, 
  totalSize 
}) => (
  <div className="flex items-center justify-between text-xs text-gray-500">
    <span>{fileCount} files</span>
    {totalSize !== undefined && <span>{formatSize(totalSize)}</span>}
    <span>{accessCount} visits</span>
  </div>
));

NotebookStats.displayName = 'NotebookStats';

export default NotebookStats;