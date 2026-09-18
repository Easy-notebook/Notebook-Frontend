import { useState, useEffect, useMemo } from 'react';
import { CodeCellViewModel } from './CodeCellViewModel';
import { Cell, ReactCodeMirrorRef } from '../utils/types';
import { cellNavigationRouter } from './CellNavigationRouter';

export const useCodeCellViewModel = (
  cell: Cell,
  dslcMode: boolean,
  isDemoMode: boolean,
  isInDetachedView: boolean,
  editorRef: React.RefObject<ReactCodeMirrorRef>,
  codeBlockWrapperRef: React.RefObject<HTMLDivElement>,
  codeContainerRef: React.RefObject<HTMLDivElement>
) => {
  const viewModel = useMemo(() => {
    return new CodeCellViewModel(cell, dslcMode, isDemoMode, isInDetachedView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Create once per component instance - intentionally empty deps

  // Update props whenever they change
  useEffect(() => {
    viewModel.updateProps(cell, isDemoMode);
  }, [cell, dslcMode, isDemoMode, isInDetachedView, viewModel]);

  // Set refs
  useEffect(() => {
    viewModel.setRefs(editorRef, codeBlockWrapperRef, codeContainerRef);
  }, [editorRef, codeBlockWrapperRef, codeContainerRef, viewModel]);

  // Subscribe to updates
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return viewModel.subscribe(() => forceUpdate((n) => n + 1));
  }, [viewModel]);

  // Listen for cell navigation events
  useEffect(() => {
    return cellNavigationRouter.subscribe(cell.id, (direction) => viewModel.focus(direction));
  }, [cell.id, viewModel]);

  return viewModel;
};
