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
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { targetCellId, direction } = customEvent.detail;

      console.log('Received cell-navigation event', { targetCellId, direction, myCellId: cell.id });

      if (targetCellId === cell.id) {
        console.log('Focusing cell', cell.id);
        viewModel.focus(direction);
      }
    };

    window.addEventListener('cell-navigation', handleNavigation);
    return () => {
      window.removeEventListener('cell-navigation', handleNavigation);
    };
  }, [cell.id, viewModel]);

  return viewModel;
};
