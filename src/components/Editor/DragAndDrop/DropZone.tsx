import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';

interface DropZoneProps {
  id: string;
  index: number;
  onAddCell?: (type: string, index: number) => void;
  className?: string;
  showAddButton?: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({
  id,
  index,
  onAddCell,
  className = '',
  showAddButton = true
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  const handleAddCell = (type: string) => {
    onAddCell?.(type, index);
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        relative h-8 group
        ${isOver ? 'bg-theme-50' : ''}
        ${className}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 拖拽目标指示器 */}
      {isOver && (
        <div className="absolute inset-0 border-2 border-dashed border-theme-400 bg-theme-50 rounded-lg" />
      )}

      {/* 添加按钮 */}
      {showAddButton && (isHovered || isOver) && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-2 z-10">
          <button
            onClick={() => handleAddCell('code')}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-theme-600 hover:bg-theme-50 rounded transition-colors"
            title="添加代码块"
          >
            <Plus size={12} />
            代码
          </button>
          <button
            onClick={() => handleAddCell('markdown')}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
            title="添加文本块"
          >
            <Plus size={12} />
            文本
          </button>
          <button
            onClick={() => handleAddCell('image')}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
            title="添加图片"
          >
            <Plus size={12} />
            图片
          </button>
          <button
            onClick={() => handleAddCell('link')}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-theme-600 hover:bg-theme-50 rounded transition-colors"
            title="添加链接"
          >
            <Plus size={12} />
            链接
          </button>
        </div>
      )}

      {/* 简单的分割线 */}
      <div className={`
        absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
        w-full h-px bg-gray-200
        ${isHovered || isOver ? 'bg-theme-300' : ''}
        transition-colors duration-200
      `} />
    </div>
  );
};

export default DropZone;
