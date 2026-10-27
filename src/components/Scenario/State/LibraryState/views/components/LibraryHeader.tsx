// LibraryState/LibraryHeader.tsx
// Header component for the notebook library

import React, { memo } from 'react';
import { Button, Input, Space } from 'antd';
import { RefreshCw, Grid, List, Search as SearchIcon, TreePine } from 'lucide-react';
import { formatSize } from '../../utils';
import type { LibraryHeaderProps } from '../../types';

const LibraryHeader: React.FC<LibraryHeaderProps> = memo(
  ({
    totalNotebooks,
    totalSize,
    searchQuery,
    viewMode,
    refreshing,
    onSearchChange,
    onViewModeChange,
    onRefresh,
  }) => (
    <div className="px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TreePine className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              Notebook Library
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {totalNotebooks} Notebooks · Total Size {formatSize(totalSize)}
            </p>
          </div>
        </div>

        <Space>
          <Button
            icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
            onClick={onRefresh}
            loading={refreshing}
          >
            Refresh
          </Button>
          <Button
            type={viewMode === 'grid' ? 'primary' : 'default'}
            aria-label="Grid view"
            icon={<Grid className="w-4 h-4" />}
            onClick={() => onViewModeChange('grid')}
          />
          <Button
            type={viewMode === 'list' ? 'primary' : 'default'}
            aria-label="List view"
            icon={<List className="w-4 h-4" />}
            onClick={() => onViewModeChange('list')}
          />
        </Space>
      </div>

      {/* Search Bar */}
      <Input
        placeholder="Search Notebook..."
        aria-label="Search notebooks"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ maxWidth: 420 }}
        size="large"
        prefix={<SearchIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
        allowClear
      />
    </div>
  )
);

LibraryHeader.displayName = 'LibraryHeader';

export default LibraryHeader;
