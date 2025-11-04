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

interface SimpleDragBlockManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const SimpleDragBlockManager: React.FC<SimpleDragBlockManagerProps> = ({
  editor,
  children
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [currentBlock, setCurrentBlock] = useState<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverBlock, setDragOverBlock] = useState<HTMLElement | null>(null);
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
    // 如果正在拖拽，不隐藏工具栏
    if (isDragging) return;
    
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!isDragging) {
        setShowToolbar(false);
        setCurrentBlock(null);
      }
    }, 300);
  }, [clearHideTimeout, isDragging]);

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


  // 使用 ProseMirror 事务进行块移动
  const moveBlockUp = () => {
    if (!editor || !currentBlock) return;
    
    try {
      const pos = getBlockPosition(currentBlock);
      if (pos === null) return;
      
      const tr = editor.state.tr;
      const resolvedPos = tr.doc.resolve(pos);
      const currentNode = resolvedPos.nodeAfter;
      
      if (!currentNode || !currentNode.isBlock) return;
      
      // 查找前一个同级块
      let prevBlockPos = null;
      let searchPos = pos - 1;
      
      while (searchPos >= 0) {
        try {
          const searchResolvedPos = tr.doc.resolve(searchPos);
          const node = searchResolvedPos.nodeBefore;
          
          if (node && node.isBlock) {
            prevBlockPos = searchPos - node.nodeSize;
            break;
          }
          searchPos--;
        } catch {
          break;
        }
      }
      
      if (prevBlockPos !== null && prevBlockPos >= 0) {
        console.log('向上移动块:', { currentPos: pos, prevPos: prevBlockPos });
        
        // 删除当前节点
        tr.delete(pos, pos + currentNode.nodeSize);
        // 在前一个节点之前插入
        tr.insert(prevBlockPos, currentNode);
        
        editor.view.dispatch(tr);
      }
    } catch (error) {
      console.error('向上移动块失败:', error);
    }
    
    setShowToolbar(false);
  };

  const moveBlockDown = () => {
    if (!editor || !currentBlock) return;
    
    try {
      const pos = getBlockPosition(currentBlock);
      if (pos === null) return;
      
      const tr = editor.state.tr;
      const resolvedPos = tr.doc.resolve(pos);
      const currentNode = resolvedPos.nodeAfter;
      
      if (!currentNode || !currentNode.isBlock) return;
      
      // 查找下一个同级块
      let nextBlockPos = null;
      let searchPos = pos + currentNode.nodeSize;
      
      while (searchPos < tr.doc.content.size) {
        try {
          const searchResolvedPos = tr.doc.resolve(searchPos);
          const node = searchResolvedPos.nodeAfter;
          
          if (node && node.isBlock) {
            nextBlockPos = searchPos + node.nodeSize;
            break;
          }
          searchPos++;
        } catch {
          break;
        }
      }
      
      if (nextBlockPos !== null && nextBlockPos <= tr.doc.content.size) {
        console.log('向下移动块:', { currentPos: pos, nextPos: nextBlockPos });
        
        // 删除当前节点
        tr.delete(pos, pos + currentNode.nodeSize);
        // 调整插入位置（因为删除了节点，位置需要调整）
        const insertPos = nextBlockPos - currentNode.nodeSize;
        tr.insert(insertPos, currentNode);
        
        editor.view.dispatch(tr);
      }
    } catch (error) {
      console.error('向下移动块失败:', error);
    }
    
    setShowToolbar(false);
  };

  // 获取块在 ProseMirror 文档中的位置
  const getBlockPosition = (blockElement: HTMLElement): number | null => {
    if (!editor) return null;
    
    try {
      const view = editor.view;
      const rect = blockElement.getBoundingClientRect();
      const editorRect = view.dom.getBoundingClientRect();
      
      // 计算块的起始位置（左上角）
      const x = rect.left + 5; // 稍微向右偏移，避免边界问题
      const y = rect.top + 5;  // 稍微向下偏移，避免边界问题
      
      // 使用 posAtCoords 获取位置
      const coords = view.posAtCoords({ left: x, top: y });
      if (!coords) return null;
      
      // 获取最近的块级节点位置
      const resolvedPos = view.state.doc.resolve(coords.pos);
      let blockPos = coords.pos;
      
      // 寻找块级节点的开始位置
      for (let depth = resolvedPos.depth; depth >= 0; depth--) {
        const node = resolvedPos.node(depth);
        if (node.isBlock && depth > 0) { // 跳过文档根节点
          blockPos = resolvedPos.start(depth);
          break;
        }
      }
      
      console.log('getBlockPosition:', {
        element: blockElement.tagName,
        coordsPos: coords.pos,
        blockPos: blockPos,
        resolvedDepth: resolvedPos.depth
      });
      
      return blockPos;
    } catch (error) {
      console.error('获取块位置失败:', error);
      return null;
    }
  };

  const deleteBlock = () => {
    if (!editor || !currentBlock) return;
    
    const pos = getBlockPosition(currentBlock);
    if (pos === null) return;
    
    const tr = editor.state.tr;
    const resolvedPos = tr.doc.resolve(pos);
    const currentNode = resolvedPos.nodeAfter;
    
    if (currentNode) {
      // 使用 ProseMirror 事务删除节点
      tr.delete(pos, pos + currentNode.nodeSize);
      editor.view.dispatch(tr);
    }
    
    setShowToolbar(false);
  };

  const duplicateBlock = () => {
    if (!editor || !currentBlock) return;
    
    const pos = getBlockPosition(currentBlock);
    if (pos === null) return;
    
    const tr = editor.state.tr;
    const resolvedPos = tr.doc.resolve(pos);
    const currentNode = resolvedPos.nodeAfter;
    
    if (currentNode) {
      // 创建节点副本并在当前节点后插入
      const duplicatedNode = currentNode.copy(currentNode.content);
      const insertPos = pos + currentNode.nodeSize;
      tr.insert(insertPos, duplicatedNode);
      editor.view.dispatch(tr);
    }
    
    setShowToolbar(false);
  };

  const insertBlockAbove = () => {
    if (!editor || !currentBlock) return;
    
    const pos = getBlockPosition(currentBlock);
    if (pos === null) return;
    
    // 使用 TipTap 命令插入新段落
    editor.chain().focus().insertContentAt(pos, '<p></p>').run();
    
    setShowToolbar(false);
  };

  // 拖拽功能 - 使用 ProseMirror 事务
  const handleDragStart = (e: React.DragEvent) => {
    if (!currentBlock || !editor) return;
    
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    
    const pos = getBlockPosition(currentBlock);
    if (pos !== null) {
      e.dataTransfer.setData('application/json', JSON.stringify({
        sourcePos: pos,
        type: 'block-move'
      }));
    }
    
    // 添加拖拽样式
    currentBlock.style.opacity = '0.5';
    currentBlock.style.transform = 'rotate(2deg)';
    
    // 不立即隐藏工具栏
    // setShowToolbar(false);
  };

  const handleDragEnd = () => {
    if (currentBlock) {
      currentBlock.style.opacity = '';
      currentBlock.style.transform = '';
    }
    
    // 清除拖拽目标高亮
    if (dragOverBlock) {
      dragOverBlock.style.backgroundColor = '';
      setDragOverBlock(null);
    }
    
    setIsDragging(false);
    
    // 延迟重新显示工具栏，避免闪烁
    setTimeout(() => {
      if (currentBlock && !isDragging) {
        setShowToolbar(true);
      }
    }, 100);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // 高亮显示拖拽目标
    const target = e.target as HTMLElement;
    const targetBlock = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre') as HTMLElement;
    
    if (targetBlock && targetBlock !== currentBlock) {
      // 清除之前的高亮
      if (dragOverBlock && dragOverBlock !== targetBlock) {
        dragOverBlock.style.backgroundColor = '';
      }
      
      // 设置新的高亮
      targetBlock.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      setDragOverBlock(targetBlock);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (!dragData) return;
      
      const { sourcePos } = JSON.parse(dragData);
      if (typeof sourcePos !== 'number') return;
      
      const target = e.target as HTMLElement;
      const targetBlock = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre') as HTMLElement;
      
      if (targetBlock && editor) {
        const targetPos = getBlockPosition(targetBlock);
        if (targetPos !== null && targetPos !== sourcePos) {
          try {
            const tr = editor.state.tr;
            const sourceResolvedPos = tr.doc.resolve(sourcePos);
            const sourceNode = sourceResolvedPos.nodeAfter;
            
            if (sourceNode) {
              console.log('拖拽操作:', { sourcePos, targetPos, sourceNodeType: sourceNode.type.name });
              
              // 删除源节点
              tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
              
              // 计算新的插入位置
              let insertPos = targetPos;
              if (sourcePos < targetPos) {
                insertPos = targetPos - sourceNode.nodeSize;
              }
              
              // 确保插入位置有效
              if (insertPos >= 0 && insertPos <= tr.doc.content.size) {
                // 插入到目标位置
                tr.insert(insertPos, sourceNode);
                editor.view.dispatch(tr);
                console.log('拖拽成功完成');
              } else {
                console.warn('插入位置无效:', insertPos);
              }
            }
          } catch (transactionError) {
            console.error('ProseMirror 事务错误:', transactionError);
          }
        }
      }
    } catch (error) {
      console.error('拖拽处理错误:', error);
    }
    
    handleDragEnd();
  };

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
    
    // 添加拖拽相关的事件监听器
    const handleGlobalDragEnd = () => {
      handleDragEnd();
    };
    
    const handleGlobalDragOver = (e: DragEvent) => {
      if (isDragging) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    
    // 全局拖拽事件，确保拖拽状态正确管理
    document.addEventListener('dragend', handleGlobalDragEnd);
    document.addEventListener('dragover', handleGlobalDragOver);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('dragend', handleGlobalDragEnd);
      document.removeEventListener('dragover', handleGlobalDragOver);
      clearHideTimeout();
    };
  }, [editor, showToolbarForBlock, scheduleHide, clearHideTimeout, isDragging, handleDragEnd]);

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

  // 添加CSS样式
  useEffect(() => {
    const styleId = 'simple-drag-block-styles';
    
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
      
      .simple-drag-toolbar {
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: opacity 0.2s ease;
      }
      
      .simple-drag-toolbar button,
      .simple-drag-toolbar div {
        transition: all 0.2s ease;
      }
      
      .simple-drag-toolbar button:hover,
      .simple-drag-toolbar div:hover {
        background-color: rgba(59, 130, 246, 0.1);
        transform: scale(1.05);
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
      
      {/* 简单的拖拽工具栏 */}
      {showToolbar && currentBlock && (
        <div
          ref={toolbarRef}
          className="simple-drag-toolbar fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-1 flex flex-col gap-1"
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

export default SimpleDragBlockManager;
