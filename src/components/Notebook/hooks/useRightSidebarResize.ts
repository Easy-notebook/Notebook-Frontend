// src/components/Notebook/hooks/useRightSidebarResize.ts
// Custom hook for right sidebar resize functionality

import { useState, useCallback } from 'react';

export const useRightSidebarResize = () => {
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('rightSidebarWidth');
    return saved ? parseInt(saved) : 384; // w-96 = 384px
  });

  const handleRightResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightSidebarWidth;
      let animationId: number | null = null;

      const handleMouseMove = (e: MouseEvent) => {
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(() => {
          const newWidth = Math.max(200, Math.min(800, startWidth + startX - e.clientX));
          setRightSidebarWidth(newWidth);
        });
      };

      const handleMouseUp = () => {
        if (animationId) cancelAnimationFrame(animationId);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        requestAnimationFrame(() => {
          localStorage.setItem('rightSidebarWidth', rightSidebarWidth.toString());
        });
      };

      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [rightSidebarWidth]
  );

  return {
    rightSidebarWidth,
    handleRightResize,
  };
};
