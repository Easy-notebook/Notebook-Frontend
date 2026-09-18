// NotebookCardSkeleton.tsx
// Lightweight skeleton placeholder for NotebookCard during lazy loading

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import type { BentoSize } from '../../types';

interface NotebookCardSkeletonProps {
  bentoSize?: BentoSize;
}

// Skeleton configuration for different bento sizes
const skeletonConfig: Record<
  BentoSize,
  {
    previewHeight: string;
    titleWidth: string;
    showDescription: boolean;
  }
> = {
  small: {
    previewHeight: 'h-40',
    titleWidth: 'w-3/4',
    showDescription: false,
  },
  medium: {
    previewHeight: 'h-56',
    titleWidth: 'w-2/3',
    showDescription: true,
  },
  large: {
    previewHeight: 'h-44',
    titleWidth: 'w-1/2',
    showDescription: true,
  },
  featured: {
    previewHeight: 'h-64',
    titleWidth: 'w-2/3',
    showDescription: true,
  },
};

// Shimmer animation for skeleton
const shimmerVariants = {
  initial: { x: '-100%' },
  animate: {
    x: '100%',
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: 'linear',
    },
  },
};

export const NotebookCardSkeleton: React.FC<NotebookCardSkeletonProps> = memo(
  ({ bentoSize = 'small' }) => {
    const config = skeletonConfig[bentoSize];

    return (
      <div className="rounded-3xl overflow-hidden bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50 h-full flex flex-col">
        {/* Preview skeleton */}
        <div
          className={`${config.previewHeight} bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 relative overflow-hidden`}
        >
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent"
            variants={shimmerVariants}
            initial="initial"
            animate="animate"
          />

          {/* Fake code lines */}
          <div className="p-6 space-y-2">
            <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-3/4" />
            <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-1/2" />
            <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-5/6" />
            <div className="h-3 bg-gray-200/60 dark:bg-gray-700/40 rounded w-2/3" />
          </div>

          {/* Time badge skeleton */}
          <div className="absolute top-3 left-3 h-6 w-20 rounded-full bg-white/40 dark:bg-black/30" />
        </div>

        {/* Content skeleton */}
        <div className="p-4 flex-1">
          {/* Title */}
          <div
            className={`h-5 bg-gray-200/80 dark:bg-gray-700/50 rounded ${config.titleWidth} mb-3`}
          />

          {/* Description */}
          {config.showDescription && (
            <div className="space-y-2 mb-3">
              <div className="h-3 bg-gray-100/80 dark:bg-gray-800/50 rounded w-full" />
              <div className="h-3 bg-gray-100/80 dark:bg-gray-800/50 rounded w-4/5" />
            </div>
          )}

          {/* Stats skeleton */}
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-blue-100/50 dark:bg-blue-900/20" />
            <div className="h-6 w-14 rounded-full bg-emerald-100/50 dark:bg-emerald-900/20" />
            <div className="h-6 w-16 rounded-full bg-violet-100/50 dark:bg-violet-900/20" />
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="flex items-center justify-end gap-2 border-t border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/40 py-2 px-4">
          <div className="h-8 w-8 rounded bg-gray-200/50 dark:bg-gray-700/30" />
          <div className="h-8 w-8 rounded bg-gray-200/50 dark:bg-gray-700/30" />
          <div className="h-8 w-8 rounded bg-gray-200/50 dark:bg-gray-700/30" />
        </div>
      </div>
    );
  }
);

NotebookCardSkeleton.displayName = 'NotebookCardSkeleton';

export default NotebookCardSkeleton;
