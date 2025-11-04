import React, { useState, useEffect } from 'react';

interface DragIndicatorProps {
  isDragging: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const DragIndicator: React.FC<DragIndicatorProps> = ({
  isDragging,
  onDragOver,
  onDrop
}) => {
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [showDropZone, setShowDropZone] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setDragPosition(null);
      setShowDropZone(false);
    }
  }, [isDragging]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragPosition({ x: e.clientX, y: e.clientY });
    setShowDropZone(true);
    onDragOver?.(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setShowDropZone(false);
    setDragPosition(null);
    onDrop?.(e);
  };

  const handleDragLeave = () => {
    setShowDropZone(false);
  };

  if (!isDragging) return null;

  return (
    <>
      {/* 全局拖拽覆盖层 */}
      <div
        className="fixed inset-0 z-40 pointer-events-none"
        style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
      >
        {/* 拖拽光标指示器 */}
        {dragPosition && (
          <div
            className="absolute w-4 h-4 bg-theme-500 rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: dragPosition.x,
              top: dragPosition.y,
            }}
          />
        )}
      </div>

      {/* 拖拽区域 */}
      <div
        className="fixed inset-0 z-30"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
      >
        {showDropZone && (
          <div className="absolute inset-4 border-2 border-dashed border-theme-400 bg-theme-50 bg-opacity-50 rounded-lg flex items-center justify-center">
            <div className="text-theme-600 text-lg font-medium">
              拖拽到此处重新排序
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default DragIndicator;
