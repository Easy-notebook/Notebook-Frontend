// useLazyLoad.ts
// Custom hook for Intersection Observer based lazy loading

import { useState, useEffect, useRef } from 'react';

interface UseLazyLoadOptions {
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Threshold for intersection observer */
  threshold?: number | number[];
  /** Whether to freeze visibility once visible (default: true) */
  freezeOnceVisible?: boolean;
  /** Delay before marking as visible (for staggered loading) */
  delay?: number;
}

interface UseLazyLoadResult {
  /** Ref to attach to the element */
  ref: React.RefObject<HTMLDivElement>;
  /** Whether the element is currently in viewport */
  isIntersecting: boolean;
  /** Whether the element has ever been in viewport */
  hasBeenVisible: boolean;
}

/**
 * Hook for lazy loading content when it enters the viewport
 */
export function useLazyLoad(options: UseLazyLoadOptions = {}): UseLazyLoadResult {
  const {
    rootMargin = '100px', // Pre-load 100px before entering viewport
    threshold = 0,
    freezeOnceVisible = true,
    delay = 0,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // If already visible and frozen, no need to observe
    if (freezeOnceVisible && hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;

        if (delay > 0 && isVisible) {
          // Delayed visibility for staggered loading
          const timer = setTimeout(() => {
            setIsIntersecting(true);
            if (isVisible) setHasBeenVisible(true);
          }, delay);
          return () => clearTimeout(timer);
        }

        setIsIntersecting(isVisible);
        if (isVisible) setHasBeenVisible(true);
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold, freezeOnceVisible, hasBeenVisible, delay]);

  return { ref, isIntersecting, hasBeenVisible };
}

/**
 * Hook for lazy loading with priority queue
 * Items closer to viewport get loaded first
 */
export function usePriorityLazyLoad(
  index: number,
  totalItems: number,
  options: UseLazyLoadOptions = {}
): UseLazyLoadResult {
  // Calculate delay based on position (items at top load faster)
  const baseDelay = Math.min(index * 30, 300); // Max 300ms delay

  return useLazyLoad({
    ...options,
    delay: baseDelay,
  });
}

export default useLazyLoad;
