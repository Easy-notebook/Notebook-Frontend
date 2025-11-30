import { useState, useEffect, useMemo } from 'react';
import { CodeCellViewModel } from './CodeCellViewModel';
import { Cell, ReactCodeMirrorRef } from '../utils/types';

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
  }, []); // Create once per component instance

  // Update props whenever they change
  useEffect(() => {
    viewModel.updateProps(cell, dslcMode, isDemoMode, isInDetachedView);
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

  return viewModel;
};
