import React, { forwardRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';

interface Cell {
  id: string;
  type: string;
  content: string;
  outputs?: unknown[];
  [key: string]: unknown;
}

interface DraggableCellProps {
  cell: Cell;
  children: React.ReactNode;
  isActive?: boolean;
  className?: string;
  onAddCell?: (type: string, afterIndex: number) => void;
  cellIndex?: number;
}

const DraggableCell = forwardRef<HTMLDivElement, DraggableCellProps>(
  ({ cell, children, isActive = false, className = '', onAddCell, cellIndex = 0 }, ref) => {
    const [showAddMenu, setShowAddMenu] = useState(false);
    const VUE_SECONDARY = '#35495E';

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: cell.id,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    // 处理添加 cell 的键盘事件
    const handleAddKeyDown = (event: React.KeyboardEvent) => {
      if (!showAddMenu) return;

      const { key, ctrlKey, metaKey, shiftKey } = event;
      const isModifierPressed = ctrlKey || metaKey;

      if (isModifierPressed && shiftKey) {
        switch (key) {
          case 'L': // Ctrl/Cmd + Shift + L - 插入代码块
            event.preventDefault();
            onAddCell?.('code', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'M': // Ctrl/Cmd + Shift + M - 插入markdown
            event.preventDefault();
            onAddCell?.('markdown', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'I': // Ctrl/Cmd + Shift + I - 插入图片
            event.preventDefault();
            onAddCell?.('image', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'B': // Ctrl/Cmd + Shift + B - 插入AI思考
            event.preventDefault();
            onAddCell?.('thinking', cellIndex + 1);
            setShowAddMenu(false);
            break;
        }
      } else if (!isModifierPressed && !shiftKey) {
        // 简化的快捷键（无修饰键）
        switch (key) {
          case 'c': // c - 插入代码块
            event.preventDefault();
            onAddCell?.('code', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'm': // m - 插入markdown
            event.preventDefault();
            onAddCell?.('markdown', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'i': // i - 插入图片
            event.preventDefault();
            onAddCell?.('image', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'a': // a - 插入AI思考
            event.preventDefault();
            onAddCell?.('thinking', cellIndex + 1);
            setShowAddMenu(false);
            break;
          case 'Escape': // Esc - 关闭菜单
            event.preventDefault();
            setShowAddMenu(false);
            break;
        }
      }
    };

    // 合并refs
    const combinedRef = (node: HTMLDivElement) => {
      setNodeRef(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    return (
      <div
        ref={combinedRef}
        style={style}
        className={`
          relative group
          ${isDragging ? 'opacity-50 z-50' : ''}
          ${isActive ? 'ring-2 ring-theme-300 ring-opacity-50' : ''}
          ${className}
        `}
      >
        {/* 左侧操作按钮组 */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-16 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
          {/* 添加按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              onKeyDown={handleAddKeyDown}
              className={`
                w-6 h-6 flex items-center justify-center
                text-gray-400 hover:text-gray-600
                cursor-pointer
                bg-white rounded border border-gray-200 shadow-sm
                transition-all duration-200
                ${showAddMenu ? 'bg-theme-50 border-theme-300 text-theme-600' : ''}
              `}
              style={{ color: showAddMenu ? '#3B82F6' : VUE_SECONDARY }}
              title="添加 Cell (快捷键: C/M/I/A)"
            >
              <Plus size={14} />
            </button>

            {/* 添加菜单 */}
            {showAddMenu && (
              <div
                className="absolute left-8 top-0 bg-white/95 backdrop-blur-md shadow-lg rounded-lg p-2 min-w-[120px] border border-gray-200"
                onMouseLeave={() => setShowAddMenu(false)}
                onKeyDown={handleAddKeyDown}
                tabIndex={0}
              >
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      onAddCell?.('code', cellIndex + 1);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                    style={{ color: VUE_SECONDARY }}
                  >
                    <span>📝</span> 代码块 (C)
                  </button>
                  <button
                    onClick={() => {
                      onAddCell?.('markdown', cellIndex + 1);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                    style={{ color: VUE_SECONDARY }}
                  >
                    <span>📄</span> 文本块 (M)
                  </button>
                  <button
                    onClick={() => {
                      onAddCell?.('image', cellIndex + 1);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                    style={{ color: VUE_SECONDARY }}
                  >
                    <span>🖼️</span> 图片 (I)
                  </button>
                  <button
                    onClick={() => {
                      onAddCell?.('thinking', cellIndex + 1);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded flex items-center gap-2"
                    style={{ color: VUE_SECONDARY }}
                  >
                    <span>🤖</span> AI思考 (A)
                  </button>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-500 px-2">按 C/M/I/A 快速添加</div>
                </div>
              </div>
            )}
          </div>

          {/* 拖拽手柄 */}
          <div
            {...attributes}
            {...listeners}
            className={`
              w-6 h-6 flex items-center justify-center
              text-gray-400 hover:text-gray-600
              cursor-grab active:cursor-grabbing
              bg-white rounded border border-gray-200 shadow-sm
              hover:shadow-md hover:border-gray-300
              transition-all duration-200
            `}
            title="拖拽重新排序"
          >
            <GripVertical size={14} />
          </div>
        </div>

        {/* Cell内容 */}
        <div
          className={`
            relative
            ${isDragging ? 'pointer-events-none' : ''}
          `}
        >
          {children}
        </div>

        {/* 拖拽时的视觉指示器 */}
        {isDragging && (
          <div className="absolute inset-0 bg-theme-100 bg-opacity-30 rounded-lg border-2 border-dashed border-theme-300" />
        )}
      </div>
    );
  }
);

DraggableCell.displayName = 'DraggableCell';

export default DraggableCell;
