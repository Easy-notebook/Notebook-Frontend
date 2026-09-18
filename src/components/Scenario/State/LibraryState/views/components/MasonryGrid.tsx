// LibraryState/MasonryGrid.tsx
// Masonry grid layout with Magic Bento style support

import React, { memo, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';

export type BentoSize = 'small' | 'medium' | 'large' | 'featured';

interface MasonryGridProps {
  children: React.ReactNode;
  className?: string;
}

// Animation variants for staggered entrance
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

/**
 * MasonryGrid - A responsive Masonry layout
 *
 * Uses Flexbox columns to create a true Masonry layout where items stack vertically
 * without gaps, regardless of their height.
 */
export const MasonryGrid: React.FC<MasonryGridProps> = memo(({ children, className = '' }) => {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) {
        setColumns(4); // xl
      } else if (width >= 1024) {
        setColumns(3); // lg
      } else if (width >= 640) {
        setColumns(2); // sm
      } else {
        setColumns(1); // default
      }
    };

    updateColumns();

    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateColumns, 100);
    };

    window.addEventListener('resize', debouncedUpdate);
    return () => {
      window.removeEventListener('resize', debouncedUpdate);
      clearTimeout(timeoutId);
    };
  }, []);

  const columnWrapper = useMemo(() => {
    const cols: React.ReactNode[][] = Array.from({ length: columns }, () => []);

    React.Children.forEach(children, (child, index) => {
      if (React.isValidElement(child)) {
        cols[index % columns].push(child);
      }
    });

    return cols;
  }, [children, columns]);

  return (
    <motion.div
      className={`flex gap-4 ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {columnWrapper.map((col, colIndex) => (
        <div key={colIndex} className="flex flex-col gap-4 flex-1 min-w-0">
          <AnimatePresence mode="popLayout">
            {col.map((child: React.ReactElement, index) => (
              <motion.div
                key={child.key || `${colIndex}-${index}`}
                variants={itemVariants}
                layout
                layoutId={child.key?.toString()}
              >
                {child}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ))}
    </motion.div>
  );
});

MasonryGrid.displayName = 'MasonryGrid';

/**
 * BentoItem - Wrapper component for Bento grid items with size support
 * Note: In Masonry layout, size props like 'large' (col-span-2) are ignored
 * as we strictly follow column-based stacking.
 */
interface BentoItemProps {
  size?: BentoSize;
  children: React.ReactNode;
  className?: string;
}

export const BentoItem: React.FC<BentoItemProps> = memo(({ children, className = '' }) => {
  return <div className={`${className} h-full w-full`}>{children}</div>;
});

BentoItem.displayName = 'BentoItem';

/**
 * Calculate optimal Bento size based on notebook metrics
 * Kept for compatibility, though MasonryGrid ignores the result for layout structure
 */
export function calculateBentoSize(
  notebook: {
    isStarred?: boolean;
    accessCount?: number;
    fileCount?: number;
    totalSize?: number;
  },
  index: number,
  _totalCount: number
): BentoSize {
  // First starred notebook gets featured size
  if (notebook.isStarred && index === 0) {
    return 'featured';
  }

  // High engagement notebooks (many visits) get large size
  if ((notebook.accessCount ?? 0) >= 10) {
    return 'large';
  }

  // Notebooks with many files get medium (tall) size
  if ((notebook.fileCount ?? 0) >= 5) {
    return 'medium';
  }

  // Starred notebooks get large size
  if (notebook.isStarred) {
    return 'large';
  }

  // Create visual variety - every 5th item after first 3 gets medium
  if (index > 2 && index % 5 === 0) {
    return 'medium';
  }

  // Default to small
  return 'small';
}

export default MasonryGrid;
