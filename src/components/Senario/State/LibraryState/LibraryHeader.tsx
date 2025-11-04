// LibraryState/LibraryHeader.tsx
// Header component for the notebook library

import React, { memo } from 'react';
import { Button, Input, Space } from 'antd';
import {
  RefreshCw,
  Grid,
  List,
  Search as SearchIcon,
  TreePine,
} from 'lucide-react';
import { formatSize } from './utils';
import type { LibraryHeaderProps } from './types';

const { Search: AntSearch } = Input;

const LibraryHeader: React.FC<LibraryHeaderProps> = memo(({
  totalNotebooks,
  totalSize,
  searchQuery,
  viewMode,
  refreshing,
  onSearchChange,
  onViewModeChange,
  onRefresh,
}) => (
  <div className="bg-white shadow-sm border-b px-6 py-4">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TreePine className="w-6 h-6 text-blue-500" />
            Notebook Library
          </h1>
          <p className="text-sm text-gray-600 mt-1">
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
          icon={<Grid className="w-4 h-4" />}
          onClick={() => onViewModeChange('grid')}
        />
        <Button
          type={viewMode === 'list' ? 'primary' : 'default'}
          icon={<List className="w-4 h-4" />}
          onClick={() => onViewModeChange('list')}
        />
      </Space>
    </div>

    {/* Search Bar */}
    <AntSearch
      placeholder="Search Notebook..."
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      style={{ maxWidth: 420 }}
      prefix={<SearchIcon className="w-4 h-4 text-gray-400" />}
      allowClear
    />
  </div>
));

LibraryHeader.displayName = 'LibraryHeader';

export default LibraryHeader;