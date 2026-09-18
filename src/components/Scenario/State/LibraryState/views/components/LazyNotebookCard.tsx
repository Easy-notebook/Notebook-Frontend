// LazyNotebookCard.tsx
// Lazy-loaded wrapper for NotebookCard with skeleton placeholder

import React, { memo, Suspense, lazy, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLazyLoad } from './useLazyLoad';
import NotebookCardSkeleton from './NotebookCardSkeleton';
import type { NotebookCardProps } from '../../types';

// Lazy load the actual NotebookCard component
const NotebookCard = lazy(() => import('./NotebookCard'));

interface LazyNotebookCardProps extends NotebookCardProps {
  /** Index for staggered loading */
  index?: number;
  /** Priority loading (skip lazy load) */
  priority?: boolean;
}

// Animation variants for smooth transition
const cardVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
};

export const LazyNotebookCard: React.FC<LazyNotebookCardProps> = memo(
  ({ index = 0, priority = false, ...props }) => {
    // Calculate root margin based on index for progressive loading
    // First few cards load immediately, later cards have more margin
    const rootMargin = useMemo(() => {
      if (priority || index < 4) return '200px'; // First 4 cards: aggressive preload
      if (index < 8) return '100px'; // Next 4 cards: moderate preload
      return '50px'; // Rest: conservative preload
    }, [index, priority]);

    const { ref, hasBeenVisible } = useLazyLoad({
      rootMargin,
      freezeOnceVisible: true,
    });

    // Priority cards skip lazy loading
    const shouldRender = priority || hasBeenVisible;

    return (
      <div ref={ref} className="h-full">
        <AnimatePresence mode="wait">
          {shouldRender ? (
            <motion.div
              key="card"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="h-full"
            >
              <Suspense fallback={<NotebookCardSkeleton bentoSize={props.bentoSize} />}>
                <NotebookCard {...props} />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="skeleton"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <NotebookCardSkeleton bentoSize={props.bentoSize} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

LazyNotebookCard.displayName = 'LazyNotebookCard';

export default LazyNotebookCard;
