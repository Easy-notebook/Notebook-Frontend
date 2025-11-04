import { useState, useEffect, useRef, useCallback } from 'react';
import { Cell, Output } from '../utils/types';
import { EXPAND_THRESHOLD } from '../utils';

/**
 * Hook to manage code block expansion/collapse behavior
 */
export const useCodeExpansion = (
  cell: Cell,
  processedOutputs: Output[],
  isInDetachedView: boolean
) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isUserToggled, setIsUserToggled] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const codeBlockWrapperRef = useRef<HTMLDivElement | null>(null);
  const prevContentRef = useRef(cell.content);

  // Force expanded state in detached view
  useEffect(() => {
    if (isInDetachedView) {
      setIsExpanded(true);
      setIsUserToggled(true);
    }
  }, [isInDetachedView]);

  // Auto-expand when new outputs arrive
  useEffect(() => {
    if (processedOutputs.length > 0 && !isExpanded && contentHeight > EXPAND_THRESHOLD) {
      setIsExpanded(true);
      setIsUserToggled(true);
    }
  }, [processedOutputs.length, isExpanded, contentHeight]);

  // Reset user toggle on significant content changes
  useEffect(() => {
    const currentContent = cell.content || '';
    const prevContent = prevContentRef.current || '';

    const contentDiff = Math.abs(currentContent.length - prevContent.length);
    if (contentDiff > 100 || (prevContent && !currentContent)) {
      setIsUserToggled(false);
    }

    prevContentRef.current = currentContent;
  }, [cell.content]);

  // Monitor code area height with ResizeObserver
  useEffect(() => {
    if (!codeBlockWrapperRef.current) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver((entries) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        for (let entry of entries) {
          const newHeight = entry.target.scrollHeight;
          setContentHeight(newHeight);
          if (!isUserToggled) {
            if (newHeight > EXPAND_THRESHOLD) {
              setIsExpanded(false);
            } else {
              setIsExpanded(true);
            }
          }
        }
      }, 100);
    });

    ro.observe(codeBlockWrapperRef.current);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      ro.disconnect();
    };
  }, [isUserToggled]);

  // Handle collapse with scroll
  const handleCollapse = useCallback((codeContainerRef: React.RefObject<HTMLDivElement>) => {
    setIsUserToggled(true);
    setIsExpanded(false);

    if (codeContainerRef.current) {
      setTimeout(() => {
        codeContainerRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
  }, []);

  const handleExpand = useCallback(() => {
    setIsUserToggled(true);
    setIsExpanded(true);
  }, []);

  return {
    isExpanded,
    isHovering,
    contentHeight,
    codeBlockWrapperRef,
    setIsHovering,
    handleExpand,
    handleCollapse,
  };
};
