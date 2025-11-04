import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import BlockToolbar from './BlockToolbar';

interface SimpleTipTapBlockManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const SimpleTipTapBlockManager: React.FC<SimpleTipTapBlockManagerProps> = ({
  editor,
  children
}) => {
  const [hoveredBlock, setHoveredBlock] = useState<{
    blockId: string;
    element: HTMLElement;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const container = containerRef.current;

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 避免在编辑时干扰
      if (target.closest('.ProseMirror-focused')) {
        return;
      }

      // 查找块级元素，但排除编辑器根元素
      const blockElement = target.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, table');

      if (blockElement &&
          container.contains(blockElement) &&
          !blockElement.closest('.ProseMirror') === blockElement.parentElement) {

        // 清除之前的超时
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }

        // 生成块ID
        const blockType = blockElement.tagName.toLowerCase();
        const blockId = `block-${blockType}-${Date.now()}`;

        // 添加CSS类和属性（不干扰编辑器）
        if (!blockElement.classList.contains('tiptap-block')) {
          blockElement.classList.add('tiptap-block');
          blockElement.setAttribute('data-block-id', blockId);
          blockElement.setAttribute('data-block-type', blockType);
        }

        setHoveredBlock({
          blockId,
          element: blockElement as HTMLElement
        });
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const relatedTarget = event.relatedTarget as HTMLElement;
      
      // 检查是否真的离开了块元素
      const blockElement = target.closest('.tiptap-block');
      const relatedBlockElement = relatedTarget?.closest?.('.tiptap-block');
      
      if (blockElement && blockElement !== relatedBlockElement) {
        // 延迟隐藏，避免鼠标移动到工具栏时立即隐藏
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredBlock(null);
        }, 100);
      }
    };

    // 添加事件监听器，使用捕获阶段避免干扰编辑器
    container.addEventListener('mouseover', handleMouseOver, true);
    container.addEventListener('mouseout', handleMouseOut, true);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver, true);
      container.removeEventListener('mouseout', handleMouseOut, true);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [editor]);

  // 添加CSS样式
  useEffect(() => {
    const styleId = 'tiptap-block-styles';

    // 避免重复添加样式
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .ProseMirror .tiptap-block {
        position: relative;
        border-radius: 4px;
        transition: all 0.2s ease;
        margin: 2px 0;
      }

      .ProseMirror .tiptap-block:hover {
        background-color: rgba(59, 130, 246, 0.05);
        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.1);
      }

      .ProseMirror .tiptap-block.selected {
        background-color: rgba(59, 130, 246, 0.1);
        border-left: 3px solid #3b82f6;
        padding-left: 8px;
      }

      .ProseMirror .tiptap-block.dragging {
        opacity: 0.5;
        transform: rotate(2deg);
      }

      /* 确保编辑器功能正常 */
      .ProseMirror {
        outline: none;
      }

      .ProseMirror p.is-editor-empty:first-child::before {
        color: #adb5bd;
        content: attr(data-placeholder);
        float: left;
        height: 0;
        pointer-events: none;
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

  const closeToolbar = () => {
    setHoveredBlock(null);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {children}
      
      {/* 块级工具栏 */}
      {hoveredBlock && (
        <BlockToolbar
          editor={editor}
          blockId={hoveredBlock.blockId}
          blockElement={hoveredBlock.element}
          isVisible={true}
          onClose={closeToolbar}
        />
      )}
    </div>
  );
};

export default SimpleTipTapBlockManager;
