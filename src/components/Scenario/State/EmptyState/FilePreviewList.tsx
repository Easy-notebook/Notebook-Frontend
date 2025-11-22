import React from 'react';
import { X, FileText } from 'lucide-react';
import { UploadFile } from './types';

interface FilePreviewListProps {
  files: UploadFile[];
  onRemove: (id: string) => void;
}

export const FilePreviewList: React.FC<FilePreviewListProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => {
        const isImage = file.type.startsWith('image/');

        return (
          <div
            key={file.id}
            className="group relative flex items-center gap-2.5 p-2 pr-7 bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 rounded-lg shadow-sm hover:shadow transition-all duration-200"
            style={{ maxWidth: '220px' }}
          >
            {/* Preview / Icon */}
            <div className="flex-shrink-0 w-9 h-9 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-600">
              {isImage ? (
                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
              ) : (
                <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              )}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>

            {/* Remove Button */}
            <button
              onClick={() => onRemove(file.id)}
              className="absolute right-0.5 top-0.5 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Remove file"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
