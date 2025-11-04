import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { 
  GripVertical,
  Plus,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface StableBlockManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const StableBlockManager: React.FC<StableBlockManagerProps> = ({
  editor,
  children
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [currentBlock, setCurrentBlock] = useState<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedBlock, setDraggedBlock] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 清除隐藏定时器
  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // 延迟隐藏工具栏
  const scheduleHide = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      setShowToolbar(false);
      setCurrentBlock(null);
    }, 300);
  }, [clearHideTimeout]);

  // 显示工具栏
  const showToolbarForBlock = useCallback((blockElement: HTMLElement) => {
    clearHideTimeout();
    
    if (blockElement !== currentBlock) {
      setCurrentBlock(blockElement);
      
      const rect = blockElement.getBoundingClientRect();
      setToolbarPosition({
        x: rect.left - 60,
        y: rect.top + window.scrollY
      });
    }
    
    setShowToolbar(true);
  }, [currentBlock, clearHideTimeout]);

  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const container = containerRef.current;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // 检查是否在工具栏上
      if (toolbarRef.current && toolbarRef.current.contains(target)) {
        clearHideTimeout();
        return;
      }
      
      // 查找块级元素
      const blockElement = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre');
      
      if (blockElement) {
        showToolbarForBlock(blockElement as HTMLElement);
      } else {
        scheduleHide();
      }
    };

    const handleMouseLeave = () => {
      scheduleHide();
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      clearHideTimeout();
    };
  }, [editor, showToolbarForBlock, scheduleHide, clearHideTimeout]);

  // 工具栏鼠标事件
  const handleToolbarMouseEnter = useCallback(() => {
    clearHideTimeout();
    setShowToolbar(true);
  }, [clearHideTimeout]);

  const handleToolbarMouseLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  // 添加CSS样式
  useEffect(() => {
    const styleId = 'stable-block-styles';
    
    if (document.getElementById(styleId)) {
      return;
    }
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .ProseMirror p:hover,
      .ProseMirror h1:hover,
      .ProseMirror h2:hover,
      .ProseMirror h3:hover,
      .ProseMirror h4:hover,
      .ProseMirror h5:hover,
      .ProseMirror h6:hover,
      .ProseMirror ul:hover,
      .ProseMirror ol:hover,
      .ProseMirror blockquote:hover,
      .ProseMirror pre:hover {
        background-color: rgba(59, 130, 246, 0.05);
        border-radius: 4px;
        transition: background-color 0.2s ease;
      }
      
      .ProseMirror {
        outline: none !important;
      }
      
      .ProseMirror p.is-editor-empty:first-child::before {
        color: #adb5bd;
        content: attr(data-placeholder);
        float: left;
        height: 0;
        pointer-events: none;
      }
      
      /* 工具栏样式 */
      .stable-block-toolbar {
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: opacity 0.2s ease;
      }
      
      .stable-block-toolbar button {
        transition: all 0.2s ease;
      }
      
      .stable-block-toolbar button:hover {
        background-color: rgba(59, 130, 246, 0.1);
        transform: scale(1.05);
      }

      /* 拖拽相关样式 */
      .ProseMirror [draggable="true"] {
        cursor: grab;
      }

      .ProseMirror [draggable="true"]:active {
        cursor: grabbing;
      }

      .ProseMirror.drag-over {
        background-color: rgba(59, 130, 246, 0.05);
      }

      .ProseMirror .dragging {
        opacity: 0.5;
        transform: rotate(2deg);
        transition: all 0.2s ease;
      }

      /* 拖拽指示器 */
      .drop-indicator {
        height: 2px;
        background-color: #3b82f6;
        margin: 4px 0;
        border-radius: 1px;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .drop-indicator.active {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  const deleteBlock = () => {
    if (!editor || !currentBlock) return;
    
    const selection = editor.state.selection;
    editor.chain().focus().deleteSelection().run();
    setShowToolbar(false);
  };

  const duplicateBlock = () => {
    if (!editor || !currentBlock) return;
    
    const selection = editor.state.selection;
    const content = editor.state.doc.cut(selection.from, selection.to);
    editor.chain().focus().insertContent(content.toJSON()).run();
    setShowToolbar(false);
  };

  const insertBlockAbove = () => {
    if (!editor) return;

    editor.chain().focus().insertContentAt(editor.state.selection.from, '<p></p>').run();
    setShowToolbar(false);
  };

  // 拖拽功能
  const handleDragStart = (e: React.DragEvent) => {
    if (!currentBlock) return;

    setIsDragging(true);
    setDraggedBlock(currentBlock);

    // 设置拖拽数据
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', currentBlock.outerHTML);

    // 添加拖拽样式
    currentBlock.style.opacity = '0.5';
    currentBlock.style.transform = 'rotate(2deg)';

    setShowToolbar(false);
  };

  const handleDragEnd = () => {
    if (draggedBlock) {
      // 恢复样式
      draggedBlock.style.opacity = '';
      draggedBlock.style.transform = '';
    }

    setIsDragging(false);
    setDraggedBlock(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (!editor || !draggedBlock) return;

    const target = e.target as HTMLElement;
    const targetBlock = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre');

    if (targetBlock && targetBlock !== draggedBlock) {
      moveBlock(draggedBlock, targetBlock as HTMLElement);
    }

    handleDragEnd();
  };

  const moveBlock = (sourceBlock: HTMLElement, targetBlock: HTMLElement) => {
    if (!editor) return;

    try {
      // 获取源块和目标块的位置
      const sourcePos = getBlockPosition(sourceBlock);
      const targetPos = getBlockPosition(targetBlock);

      if (sourcePos === null || targetPos === null) return;

      const { state } = editor;
      const { doc } = state;

      // 获取源块的内容
      const sourceNode = doc.nodeAt(sourcePos.pos);
      if (!sourceNode) return;

      const tr = state.tr;

      // 删除源块
      tr.delete(sourcePos.pos, sourcePos.pos + sourceNode.nodeSize);

      // 计算新的插入位置
      let insertPos = targetPos.pos;
      if (sourcePos.pos < targetPos.pos) {
        insertPos = targetPos.pos - sourceNode.nodeSize;
      }

      // 插入到目标位置
      tr.insert(insertPos, sourceNode);

      // 应用变换
      editor.view.dispatch(tr);

    } catch (error) {
      console.error('移动块时出错:', error);
    }
  };

  const getBlockPosition = (blockElement: HTMLElement) => {
    if (!editor) return null;

    const { state } = editor;
    const { doc } = state;

    // 通过DOM位置查找ProseMirror位置
    let result = null;

    doc.descendants((node, pos) => {
      if (result) return false;

      if (node.isBlock && node.type.name !== 'doc') {
        const domNode = editor.view.nodeDOM(pos);
        if (domNode === blockElement || domNode?.contains(blockElement)) {
          result = { pos, node };
          return false;
        }
      }
    });

    return result;
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {/* 稳定的工具栏 */}
      {showToolbar && currentBlock && (
        <div
          ref={toolbarRef}
          className="stable-block-toolbar fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-1 flex flex-col gap-1"
          style={{
            left: toolbarPosition.x,
            top: toolbarPosition.y,
          }}
          onMouseEnter={handleToolbarMouseEnter}
          onMouseLeave={handleToolbarMouseLeave}
        >
          {/* 拖拽手柄 */}
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className="p-2 hover:bg-gray-100 rounded text-gray-600 cursor-grab active:cursor-grabbing"
            title="拖拽移动"
          >
            <GripVertical size={14} />
          </div>

          {/* 插入按钮 */}
          <button
            onClick={insertBlockAbove}
            className="p-2 hover:bg-gray-100 rounded text-gray-600"
            title="在上方插入"
          >
            <Plus size={14} />
          </button>

          {/* 复制 */}
          <button
            onClick={duplicateBlock}
            className="p-2 hover:bg-gray-100 rounded text-gray-600"
            title="复制块"
          >
            <Copy size={14} />
          </button>

          {/* 删除 */}
          <button
            onClick={deleteBlock}
            className="p-2 hover:bg-gray-100 rounded text-red-600"
            title="删除块"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default StableBlockManager;
