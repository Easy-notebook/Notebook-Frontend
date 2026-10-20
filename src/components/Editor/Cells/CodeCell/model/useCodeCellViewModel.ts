import { useEffect, useMemo, useSyncExternalStore } from 'react';
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

  // Detect changes between render and subscription, including child layout measurements.
  useSyncExternalStore(viewModel.subscribe, viewModel.getSnapshot, viewModel.getSnapshot);
  useEffect(() => viewModel.cancelPendingScroll, [viewModel]);

  return viewModel;
};
