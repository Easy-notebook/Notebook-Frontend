import React, { useRef, useEffect, useState } from 'react';
import { 
  Play, 
  Square, 
  ChevronUp, 
  ChevronDown, 
  Copy, 
  Trash2, 
  MoreVertical,
  Plus
} from 'lucide-react';

interface CellWrapperProps {
  cellId: string;
  cellType: string;
  isSelected: boolean;
  isFocused: boolean;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  children: React.ReactNode;
  onSelect: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onInsertAbove: (type: string) => void;
  onInsertBelow: (type: string) => void;
  onRun?: () => void;
  onStop?: () => void;
  registerRef: (element: HTMLElement | null) => void;
  className?: string;
}

const CellWrapper: React.FC<CellWrapperProps> = ({
  cellId,
  cellType,
  isSelected,
  isFocused,
  isEditing,
  canMoveUp,
  canMoveDown,
  children,
  onSelect,
  onFocus,
  onBlur,
  onStartEdit,
  onStopEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onInsertAbove,
  onInsertBelow,
  onRun,
  onStop,
  registerRef,
  className = ''
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState<'above' | 'below' | null>(null);

  // 注册ref
  useEffect(() => {
    registerRef(wrapperRef.current);
    return () => registerRef(null);
  }, [registerRef]);

  // 处理点击选中
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSelected) {
      onSelect();
    }
  };

  // 处理双击编辑
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing && cellType !== 'thinking') {
      onStartEdit();
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSelected) return;

    switch (e.key) {
      case 'Enter':
        if (e.shiftKey) {
          // Shift+Enter: 运行cell
          e.preventDefault();
          onRun?.();
        } else if (!isEditing) {
          // Enter: 开始编辑
          e.preventDefault();
          onStartEdit();
        }
        break;
      case 'Escape':
        if (isEditing) {
          e.preventDefault();
          onStopEdit();
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (!isEditing) {
          e.preventDefault();
          onDelete();
        }
        break;
      case 'ArrowUp':
        if (!isEditing && e.metaKey) {
          e.preventDefault();
          onMoveUp();
        }
        break;
      case 'ArrowDown':
        if (!isEditing && e.metaKey) {
          e.preventDefault();
          onMoveDown();
        }
        break;
      case 'd':
        if (!isEditing && e.metaKey) {
          e.preventDefault();
          onDuplicate();
        }
        break;
      case 'a':
        if (!isEditing && e.metaKey) {
          e.preventDefault();
          onInsertAbove('code');
        }
        break;
      case 'b':
        if (!isEditing && e.metaKey) {
          e.preventDefault();
          onInsertBelow('code');
        }
        break;
    }
  };

  const insertMenuItems = [
    { type: 'code', label: '代码块', icon: '📝' },
    { type: 'markdown', label: '文本块', icon: '📄' },
    { type: 'image', label: '图片', icon: '🖼️' },
    { type: 'thinking', label: 'AI思考', icon: '🤖' },
  ];

  return (
    <div
      ref={wrapperRef}
      className={`
        relative group cell-wrapper
        ${isSelected ? 'ring-2 ring-theme-500 ring-opacity-50' : ''}
        ${isFocused ? 'shadow-lg' : 'shadow-sm'}
        ${isEditing ? 'ring-2 ring-green-500 ring-opacity-50' : ''}
        bg-white rounded-lg transition-all duration-200
        ${className}
      `}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => {
        setShowToolbar(false);
        setShowInsertMenu(null);
      }}
      tabIndex={0}
      data-cell-id={cellId}
    >
      {/* 左侧选中指示器 */}
      {isSelected && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-theme-500 rounded-l-lg" />
      )}

      {/* 顶部插入区域 */}
      <div 
        className="absolute -top-2 left-0 right-0 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseEnter={() => setShowInsertMenu('above')}
      >
        {showInsertMenu === 'above' && (
          <div className="flex items-center gap-1 bg-white shadow-lg rounded-lg px-2 py-1 border">
            {insertMenuItems.map(item => (
              <button
                key={item.type}
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertAbove(item.type);
                  setShowInsertMenu(null);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-gray-100 rounded"
                title={`在上方插入${item.label}`}
              >
                <span>{item.icon}</span>
                <Plus size={12} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 左侧工具栏 */}
      {showToolbar && isSelected && (
        <div className="absolute -left-12 top-2 flex flex-col gap-1 bg-white shadow-lg rounded-lg p-1 border">
          {onRun && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRun();
              }}
              className="p-1 hover:bg-gray-100 rounded text-green-600"
              title="运行"
            >
              <Play size={14} />
            </button>
          )}
          
          {onStop && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
              title="停止"
            >
              <Square size={14} />
            </button>
          )}

          {canMoveUp && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
              title="向上移动"
            >
              <ChevronUp size={14} />
            </button>
          )}

          {canMoveDown && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
              title="向下移动"
            >
              <ChevronDown size={14} />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 hover:bg-gray-100 rounded text-gray-600"
            title="复制"
          >
            <Copy size={14} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 hover:bg-gray-100 rounded text-red-600"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Cell内容 */}
      <div className="relative">
        {children}
      </div>

      {/* 底部插入区域 */}
      <div 
        className="absolute -bottom-2 left-0 right-0 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseEnter={() => setShowInsertMenu('below')}
      >
        {showInsertMenu === 'below' && (
          <div className="flex items-center gap-1 bg-white shadow-lg rounded-lg px-2 py-1 border">
            {insertMenuItems.map(item => (
              <button
                key={item.type}
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertBelow(item.type);
                  setShowInsertMenu(null);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-gray-100 rounded"
                title={`在下方插入${item.label}`}
              >
                <span>{item.icon}</span>
                <Plus size={12} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 状态指示器 */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {isEditing && (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="编辑中" />
        )}
        {isFocused && !isEditing && (
          <div className="w-2 h-2 bg-theme-500 rounded-full" title="已聚焦" />
        )}
      </div>
    </div>
  );
};

export default CellWrapper;
