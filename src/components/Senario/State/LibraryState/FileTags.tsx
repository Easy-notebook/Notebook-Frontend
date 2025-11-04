// LibraryState/FileTags.tsx
// File tags component for displaying file lists with modern colorful UI

import React, { memo, useMemo } from 'react';
import { Tag } from 'antd';
import { FileText, Image, Code, Database, Archive, FileCheck } from 'lucide-react';
import { CONSTANTS } from './types';
import type { FileTagsProps } from './types';

// Modern color palette for file types
const FILE_TYPE_COLORS = {
  // Code files
  code: { color: 'processing', icon: Code },
  // Documents
  document: { color: 'blue', icon: FileText },
  // Images
  image: { color: 'green', icon: Image },
  // Data files
  data: { color: 'orange', icon: Database },
  // Archives
  archive: { color: 'purple', icon: Archive },
  // Default
  default: { color: 'default', icon: FileCheck },
} as const;

// File extension to type mapping
const getFileType = (filename: string): keyof typeof FILE_TYPE_COLORS => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'css', 'html', 'php', 'rb', 'go', 'rs', 'swift'].includes(ext)) {
    return 'code';
  }
  
  // Documents
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'rtf', 'odt'].includes(ext)) {
    return 'document';
  }
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  
  // Data files
  if (['json', 'csv', 'xml', 'yaml', 'yml', 'sql', 'db'].includes(ext)) {
    return 'data';
  }
  
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return 'archive';
  }
  
  return 'default';
};

const FileTags: React.FC<FileTagsProps> = memo(({ 
  files, 
  maxVisible = CONSTANTS.MAX_VISIBLE_FILES 
}) => {
  const processedFiles = useMemo(() => {
    if (!files || files.length === 0) return [];
    
    return files.slice(0, maxVisible).map((fname, i) => {
      const fileType = getFileType(fname);
      const { color, icon: IconComponent } = FILE_TYPE_COLORS[fileType];
      const displayName = fname.length > CONSTANTS.TRUNCATE_LENGTH 
        ? `${fname.slice(0, CONSTANTS.TRUNCATE_LENGTH)}...` 
        : fname;
      
      return {
        key: i,
        name: displayName,
        color,
        icon: IconComponent,
        originalName: fname,
      };
    });
  }, [files, maxVisible]);

  if (!files || files.length === 0) return null;
  
  const hasMore = files.length > maxVisible;
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {processedFiles.map(({ key, name, color, icon: IconComponent, originalName }) => (
        <Tag
          key={key}
          color={color}
          className="flex items-center gap-1 text-xs rounded-md border-0 px-2 py-0.5 m-0"
          title={originalName}
        >
          <IconComponent size={10} className="flex-shrink-0" />
          <span className="truncate">{name}</span>
        </Tag>
      ))}
      {hasMore && (
        <Tag
          color="default"
          className="text-xs rounded-md border-0 px-2 py-0.5 m-0 opacity-75"
        >
          +{files.length - maxVisible}
        </Tag>
      )}
    </div>
  );
});

FileTags.displayName = 'FileTags';

export default FileTags;