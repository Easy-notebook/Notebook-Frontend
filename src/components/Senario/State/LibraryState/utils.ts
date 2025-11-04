// LibraryState/utils.ts
// Utility functions for LibraryState components

import { useEffect, useState, useRef, useCallback } from 'react';
import { CONSTANTS } from './types';

// Time formatting utility
export const formatTime = (timestamp?: number): string => {
  if (!timestamp) return 'just now';
  const diff = Date.now() - timestamp;
  const units = [
    { value: 24 * 60 * 60 * 1000, label: 'days' },
    { value: 60 * 60 * 1000, label: 'hours' },
    { value: 60 * 1000, label: 'minutes' },
  ];
  
  for (const unit of units) {
    if (diff >= unit.value) {
      return `${Math.floor(diff / unit.value)} ${unit.label} ago`;
    }
  }
  return 'just now';
};

// Size formatting utility
export const formatSize = (bytes?: number): string => {
  const b = bytes ?? 0;
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = b === 0 ? 0 : Math.floor(Math.log(b) / Math.log(1024));
  const value = b / Math.pow(1024, index);
  return `${index === 0 ? b : value.toFixed(1)} ${units[index]}`;
};

// Generate notebook color from ID
export const getNotebookColor = (id: string): string => {
  return `hsl(${(id.charCodeAt(0) * 137.5) % 360}, 70%, 50%)`;
};

// Debounce hook
export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Swipe gesture hook
export const useSwipeGesture = (onSwipe: () => void, threshold = CONSTANTS.SWIPE_THRESHOLD) => {
  const touchStartX = useRef<number | null>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipeDistance(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    if (deltaX > 0) {
      setSwipeDistance(Math.min(deltaX, CONSTANTS.MAX_SWIPE_DISTANCE));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeDistance > threshold) {
      onSwipe();
    }
    touchStartX.current = null;
    setSwipeDistance(0);
  }, [swipeDistance, threshold, onSwipe]);

  return {
    swipeDistance,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
};