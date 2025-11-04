// LibraryState/SwipeIndicator.tsx
// Swipe back indicator component

import React, { memo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CONSTANTS } from './types';

interface SwipeIndicatorProps {
  swipeDistance: number;
  visible: boolean;
}

const SwipeIndicator: React.FC<SwipeIndicatorProps> = memo(({ swipeDistance, visible }) => {
  if (!visible || swipeDistance <= 0) return null;

  return (
    <div
      className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-full shadow-lg pointer-events-none"
      style={{ 
        opacity: swipeDistance / CONSTANTS.MAX_SWIPE_DISTANCE,
        transform: `translateX(${Math.min(swipeDistance * 0.5, 50)}px)`
      }}
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="text-sm">返回</span>
    </div>
  );
});

SwipeIndicator.displayName = 'SwipeIndicator';

export default SwipeIndicator;