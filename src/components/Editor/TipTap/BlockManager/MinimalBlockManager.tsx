import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  GripVertical,
  Plus,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface MinimalBlockManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const MinimalBlockManager: React.FC<MinimalBlockManagerProps> = ({
  editor,
  children
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [currentBlock, setCurrentBlock] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const container = containerRef.current;
    let hideTimeout: NodeJS.Timeout | null = null;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 检查是否在工具栏上
      const isOnToolbar = target.closest('.block-toolbar');
      if (isOnToolbar) {
        // 如果在工具栏上，清除隐藏定时器
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
        return;
      }

      // 查找块级元素
      const blockElement = target.closest('.ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre');

      if (blockElement && blockElement !== currentBlock) {
        // 清除之前的隐藏定时器
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }

        setCurrentBlock(blockElement as HTMLElement);

        const rect = blockElement.getBoundingClientRect();
        setToolbarPosition({
          x: rect.left - 60,
          y: rect.top + window.scrollY
        });
        setShowToolbar(true);
      } else if (!blockElement && !isOnToolbar) {
        // 延迟隐藏工具栏，给用户时间移动到工具栏上
        if (hideTimeout) {
          clearTimeout(hideTimeout);
        }
        hideTimeout = setTimeout(() => {
          setShowToolbar(false);
          setCurrentBlock(null);
        }, 300); // 增加延迟时间
      }
    };

    const handleMouseLeave = () => {
      // 延迟隐藏，给用户时间移动到工具栏
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      hideTimeout = setTimeout(() => {
        setShowToolbar(false);
        setCurrentBlock(null);
      }, 300);
    };

    // 全局鼠标移动监听，确保工具栏交互正常
    const handleGlobalMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isOnToolbar = target.closest('.block-toolbar');

      if (isOnToolbar && hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [editor, currentBlock]);

  // 添加基础样式
  useEffect(() => {
    const styleId = 'minimal-block-styles';
    
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

      /* 工具栏样式 */
      .block-toolbar {
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .block-toolbar button {
        transition: all 0.2s ease;
      }

      .block-toolbar button:hover {
        background-color: rgba(59, 130, 246, 0.1);
        transform: scale(1.05);
      }

      /* 确保工具栏在hover时保持可见 */
      .block-toolbar:hover {
        opacity: 1 !important;
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
    
    // 简单的删除方法
    const selection = editor.state.selection;
    editor.chain().focus().deleteSelection().run();
    setShowToolbar(false);
  };

  const duplicateBlock = () => {
    if (!editor || !currentBlock) return;
    
    // 简单的复制方法
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

  return (
    <div ref={containerRef} className="relative">
      {children}
      
      {/* 简单的工具栏 */}
      {showToolbar && currentBlock && (
        <div
          className="block-toolbar fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-1 flex flex-col gap-1"
          style={{
            left: toolbarPosition.x,
            top: toolbarPosition.y,
          }}
          onMouseEnter={() => {
            // 鼠标进入工具栏时，确保工具栏保持显示
            setShowToolbar(true);
          }}
          onMouseLeave={(e) => {
            // 检查鼠标是否移动到了当前块上
            const rect = currentBlock?.getBoundingClientRect();
            if (rect) {
              const { clientX, clientY } = e;
              const isOverBlock = clientX >= rect.left &&
                                clientX <= rect.right &&
                                clientY >= rect.top &&
                                clientY <= rect.bottom;

              if (!isOverBlock) {
                // 延迟隐藏，给用户时间移动回块或工具栏
                setTimeout(() => {
                  setShowToolbar(false);
                  setCurrentBlock(null);
                }, 200);
              }
            } else {
              setTimeout(() => {
                setShowToolbar(false);
                setCurrentBlock(null);
              }, 200);
            }
          }}
        >
          {/* 拖拽手柄 */}
          <button
            className="p-2 hover:bg-gray-100 rounded text-gray-600 cursor-grab"
            title="拖拽移动"
          >
            <GripVertical size={14} />
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

export default MinimalBlockManager;
