// src/components/Notebook/hooks/useCellRenderer.ts
// Custom hook for rendering cells

import { useCallback } from 'react';
import {
  CodeCell,
  MarkdownCell,
  HybridCell,
  ImageCell,
  AIThinkingCell,
  LinkCell,
} from '@Editor/Cells';

interface CellRendererProps {
  viewMode: string;
  uploadMode: any;
  allowedTypes: any;
  maxFiles: any;
  deleteCell: (cellId: string) => void;
  updateCell: (cellId: string, content: any) => void;
}

export const useCellRenderer = ({
  viewMode,
  uploadMode,
  allowedTypes,
  maxFiles,
  deleteCell,
  updateCell,
}: CellRendererProps) => {
  const renderCell = useCallback(
    (cell: any) => {
      if (!cell) return null;

      const props = {
        cell,
        onDelete:
          (viewMode as any) === 'complete' || (viewMode as any) === 'create'
            ? () => deleteCell(cell.id)
            : undefined,
        onUpdate: (newContent: any) => updateCell(cell.id, newContent),
        className: 'w-full',
        viewMode,
        enableEdit: cell.enableEdit,
        uploadMode,
        allowedTypes,
        maxFiles,
      };

      const codeProps = {
        ...props,
        isDemoMode: viewMode === 'demo',
      };

      switch (cell.type) {
        case 'Hybrid':
        case 'hybrid':
          return <HybridCell key={cell.id} {...props} />;
        case 'code':
          return <CodeCell key={cell.id} {...codeProps} />;
        case 'markdown':
          return <MarkdownCell key={cell.id} {...props} />;
        case 'image':
          return <ImageCell key={cell.id} {...props} />;
        case 'thinking':
          return <AIThinkingCell key={cell.id} {...props} />;
        case 'link':
          return <LinkCell key={cell.id} {...props} />;
        default:
          return null;
      }
    },
    [viewMode, uploadMode, allowedTypes, maxFiles, deleteCell, updateCell]
  );

  return { renderCell };
};
