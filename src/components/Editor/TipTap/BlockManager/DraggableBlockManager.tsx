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

interface DraggableBlockManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const DraggableBlockManager: React.FC<DraggableBlockManagerProps> = ({
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
      if (isDragging) return; // 拖拽时不处理hover
      
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
      if (!isDragging) {
        scheduleHide();
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      clearHideTimeout();
    };
  }, [editor, showToolbarForBlock, scheduleHide, clearHideTimeout, isDragging]);

  // 工具栏鼠标事件
  const handleToolbarMouseEnter = useCallback(() => {
    clearHideTimeout();
    setShowToolbar(true);
  }, [clearHideTimeout]);

  const handleToolbarMouseLeave = useCallback(() => {
    if (!isDragging) {
      scheduleHide();
    }
  }, [scheduleHide, isDragging]);

  // 简单的块操作函数
  const moveBlockUp = () => {
    if (!editor || !currentBlock) return;
    
    const blocks = Array.from(containerRef.current?.querySelectorAll('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre') || []);
    const currentIndex = blocks.indexOf(currentBlock);
    
    if (currentIndex > 0) {
      const prevBlock = blocks[currentIndex - 1];
      swapBlocks(currentBlock, prevBlock as HTMLElement);
    }
    
    setShowToolbar(false);
  };

  const moveBlockDown = () => {
    if (!editor || !currentBlock) return;
    
    const blocks = Array.from(containerRef.current?.querySelectorAll('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre') || []);
    const currentIndex = blocks.indexOf(currentBlock);
    
    if (currentIndex < blocks.length - 1) {
      const nextBlock = blocks[currentIndex + 1];
      swapBlocks(currentBlock, nextBlock as HTMLElement);
    }
    
    setShowToolbar(false);
  };

  // 通过DOM元素获取对应的ProseMirror块信息
  const getBlockInfoFromElement = (blockElement: HTMLElement | null): { pos: number; node: any } | null => {
    if (!editor || !blockElement) return null;
    const { state } = editor;
    let result: { pos: number; node: any } | null = null;

    state.doc.descendants((node, pos) => {
      if (result) return false;
      if (node.isBlock) {
        const depth = state.doc.resolve(pos).depth;
        if (depth !== 1) return true; // 只允许顶层块
        const dom = editor.view.nodeDOM(pos) as Node | null;
        if (dom && (dom === blockElement || (dom as HTMLElement).contains(blockElement))) {
          result = { pos, node };
          return false;
        }
      }
      return true;
    });

    return result;
  };

  const moveNodeRelative = (sourcePos: number, targetPos: number, targetNodeSize: number, place: 'before' | 'after') => {
    if (!editor) return;
    const { state, view } = editor;
    const sourceNode = state.doc.nodeAt(sourcePos);
    if (!sourceNode) return;
    if (sourcePos === targetPos) return;

    let tr = state.tr;
    // 删除源节点
    tr = tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
    // 计算插入位置（before/after），并映射到当前tr
    const baseTarget = place === 'before' ? targetPos : targetPos + targetNodeSize;
    const mappedTarget = tr.mapping.map(baseTarget, -1);
    tr = tr.insert(mappedTarget, sourceNode);
    view.dispatch(tr);
  };

  const getTopLevelBlocks = (): { pos: number; node: any }[] => {
    if (!editor) return [];
    const { state } = editor;
    const blocks: { pos: number; node: any }[] = [];
    state.doc.descendants((node, pos) => {
      const depth = state.doc.resolve(pos).depth;
      if (depth === 1 && node.isBlock) {
        blocks.push({ pos, node });
        return false; // 不深入块内部
      }
      return true;
    });
    return blocks;
  };

  const swapBlocks = (block1: HTMLElement, block2: HTMLElement) => {
    if (!editor) return;
    const info1 = getBlockInfoFromElement(block1);
    const info2 = getBlockInfoFromElement(block2);
    if (!info1 || !info2) return;
    // 根据当前顺序选择插入位置，避免来回互换
    const place: 'before' | 'after' = info1.pos < info2.pos ? 'after' : 'before';
    moveNodeRelative(info1.pos, info2.pos, info2.node.nodeSize, place);
  };

  const getBlockStart = (blockElement: HTMLElement): number => {
    const info = getBlockInfoFromElement(blockElement);
    return info ? info.pos : 0;
  };

  const deleteBlock = () => {
    if (!editor || !currentBlock) return;
    const info = getBlockInfoFromElement(currentBlock);
    if (!info) return;
    const { state, view } = editor;
    const tr = state.tr.delete(info.pos, info.pos + info.node.nodeSize);
    view.dispatch(tr);
    setShowToolbar(false);
  };

  const duplicateBlock = () => {
    if (!editor || !currentBlock) return;
    const info = getBlockInfoFromElement(currentBlock);
    if (!info) return;
    const { state, view } = editor;
    const insertPos = info.pos + info.node.nodeSize;
    const tr = state.tr.insert(insertPos, info.node.copy(info.node.content));
    view.dispatch(tr);
    setShowToolbar(false);
  };

  const insertBlockAbove = () => {
    if (!editor || !currentBlock) return;
    const info = getBlockInfoFromElement(currentBlock);
    if (!info) return;
    editor.chain().focus().insertContentAt(info.pos, { type: 'paragraph' }).run();
    setShowToolbar(false);
  };

  // 拖拽功能
  const handleDragStart = (e: React.DragEvent) => {
    if (!currentBlock) return;

    setIsDragging(true);
    setDraggedBlock(currentBlock);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'block-drag');

    // 添加拖拽样式
    currentBlock.classList.add('dragging');
    setShowToolbar(false);
  };

  const handleDragEnd = () => {
    if (draggedBlock) {
      draggedBlock.classList.remove('dragging');
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
    const targetBlock = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre') as HTMLElement | null;

    if (targetBlock && targetBlock !== draggedBlock) {
      // 使用ProseMirror事务移动节点
      const srcInfo = getBlockInfoFromElement(draggedBlock);
      const dstInfo = getBlockInfoFromElement(targetBlock);
      if (srcInfo && dstInfo) {
        moveNodeBefore(srcInfo.pos, dstInfo.pos);
      }
    }

    handleDragEnd();
  };

  // 添加CSS样式
  useEffect(() => {
    const styleId = 'draggable-block-styles';
    
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
      
      .draggable-block-toolbar {
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: opacity 0.2s ease;
      }
      
      .draggable-block-toolbar button,
      .draggable-block-toolbar div {
        transition: all 0.2s ease;
      }
      
      .draggable-block-toolbar button:hover,
      .draggable-block-toolbar div:hover {
        background-color: rgba(59, 130, 246, 0.1);
        transform: scale(1.05);
      }
      
      .dragging {
        opacity: 0.5 !important;
        transform: rotate(2deg) !important;
        transition: all 0.2s ease;
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

  return (
    <div 
      ref={containerRef} 
      className="relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {/* 可拖拽的工具栏 */}
      {showToolbar && currentBlock && (
        <div
          ref={toolbarRef}
          className="draggable-block-toolbar fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-1 flex flex-col gap-1"
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

          {/* 向上移动 */}
          <button
            onClick={moveBlockUp}
            className="p-2 hover:bg-gray-100 rounded text-gray-600"
            title="向上移动"
          >
            <ChevronUp size={14} />
          </button>

          {/* 向下移动 */}
          <button
            onClick={moveBlockDown}
            className="p-2 hover:bg-gray-100 rounded text-gray-600"
            title="向下移动"
          >
            <ChevronDown size={14} />
          </button>

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

export default DraggableBlockManager;
