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
    <div className="flex flex-wrap gap-3 mb-4 px-1">
      {files.map((file) => {
        const isImage = file.type.startsWith('image/');

        return (
          <div
            key={file.id}
            className="group relative flex items-center gap-3 p-2 pr-8 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
            style={{ maxWidth: '240px' }}
          >
            {/* Preview / Icon */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-600">
              {isImage ? (
                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
              ) : (
                <FileText className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              )}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>

            {/* Remove Button */}
            <button
              onClick={() => onRemove(file.id)}
              className="absolute right-1 top-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Remove file"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
