import { useMemo } from 'react';
import { Cell as StoreCell } from '@Store/models';
import { HybridCellViewModel } from './HybridCellViewModel';

export const useHybridCellViewModel = (cell: StoreCell) => {
  const { id, type, content } = cell;
  // Rendering depends only on source and identity; edits resolve the live store
  // cell in handleContentChange. Output/metadata updates must not reparse source.
  // A render-local model also avoids effect-driven stale content and extra commits.
  return useMemo(() => new HybridCellViewModel({ id, type, content }), [id, type, content]);
};
