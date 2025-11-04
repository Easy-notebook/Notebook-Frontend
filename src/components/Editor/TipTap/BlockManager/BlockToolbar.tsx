import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { 
  GripVertical,
  Plus,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Type,
  Code,
  List,
  Quote,
  Heading1,
  Heading2,
  Table
} from 'lucide-react';

interface BlockToolbarProps {
  editor: Editor | null;
  blockId: string;
  blockElement: HTMLElement;
  isVisible: boolean;
  onClose: () => void;
}

const BlockToolbar: React.FC<BlockToolbarProps> = ({
  editor,
  blockId,
  blockElement,
  isVisible,
  onClose
}) => {
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 计算工具栏位置
  useEffect(() => {
    if (isVisible && blockElement) {
      const rect = blockElement.getBoundingClientRect();
      setPosition({
        x: rect.left - 60, // 工具栏在左侧
        y: rect.top + window.scrollY
      });
    }
  }, [isVisible, blockElement]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  if (!isVisible || !editor) return null;

  // 获取当前块的位置
  const getBlockPosition = () => {
    if (!blockElement || !editor) return null;

    // 通过DOM元素查找在编辑器中的位置
    const { state } = editor;
    const { doc } = state;

    // 简单的方法：通过文本内容查找位置
    let pos = 0;
    let found = false;

    doc.descendants((node, nodePos) => {
      if (found) return false;

      if (node.isBlock && node.type.name !== 'doc') {
        const domNode = editor.view.nodeDOM(nodePos);
        if (domNode === blockElement) {
          pos = nodePos;
          found = true;
          return false;
        }
      }
    });

    return found ? pos : null;
  };

  // 删除当前块
  const deleteBlock = () => {
    const pos = getBlockPosition();
    if (pos !== null) {
      const node = editor.state.doc.nodeAt(pos);
      if (node) {
        editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
      }
    }
    onClose();
  };

  // 复制当前块
  const duplicateBlock = () => {
    const pos = getBlockPosition();
    if (pos !== null) {
      const node = editor.state.doc.nodeAt(pos);
      if (node) {
        const endPos = pos + node.nodeSize;
        editor.chain().focus().setTextSelection(endPos).insertContent(node.toJSON()).run();
      }
    }
    onClose();
  };

  // 向上移动块
  const moveBlockUp = () => {
    const pos = getBlockPosition();
    if (pos !== null && pos > 0) {
      const node = editor.state.doc.nodeAt(pos);
      const prevNode = editor.state.doc.nodeAt(pos - 1);
      
      if (node && prevNode) {
        const tr = editor.state.tr;
        // 删除当前节点
        tr.delete(pos, pos + node.nodeSize);
        // 在前一个节点之前插入
        tr.insert(pos - prevNode.nodeSize, node);
        editor.view.dispatch(tr);
      }
    }
    onClose();
  };

  // 向下移动块
  const moveBlockDown = () => {
    const pos = getBlockPosition();
    if (pos !== null) {
      const node = editor.state.doc.nodeAt(pos);
      const nextPos = pos + (node?.nodeSize || 0);
      const nextNode = editor.state.doc.nodeAt(nextPos);
      
      if (node && nextNode) {
        const tr = editor.state.tr;
        // 删除当前节点
        tr.delete(pos, pos + node.nodeSize);
        // 在下一个节点之后插入
        tr.insert(nextPos, node);
        editor.view.dispatch(tr);
      }
    }
    onClose();
  };

  // 在当前块之前插入新块
  const insertBlockBefore = (type: string) => {
    const pos = getBlockPosition();
    if (pos !== null) {
      editor.chain().focus().setTextSelection(pos);
      
      switch (type) {
        case 'paragraph':
          editor.chain().insertContentAt(pos, '<p></p>').run();
          break;
        case 'heading1':
          editor.chain().insertContentAt(pos, '<h1></h1>').run();
          break;
        case 'heading2':
          editor.chain().insertContentAt(pos, '<h2></h2>').run();
          break;
        case 'codeblock':
          editor.chain().insertContentAt(pos, '<pre><code></code></pre>').run();
          break;
        case 'bulletlist':
          editor.chain().insertContentAt(pos, '<ul><li></li></ul>').run();
          break;
        case 'quote':
          editor.chain().insertContentAt(pos, '<blockquote><p></p></blockquote>').run();
          break;
        case 'table':
          editor.chain().setTextSelection(pos).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          break;
      }
    }
    setShowInsertMenu(false);
    onClose();
  };

  const insertOptions = [
    { type: 'paragraph', label: '段落', icon: <Type size={14} /> },
    { type: 'heading1', label: '标题 1', icon: <Heading1 size={14} /> },
    { type: 'heading2', label: '标题 2', icon: <Heading2 size={14} /> },
    { type: 'codeblock', label: '代码块', icon: <Code size={14} /> },
    { type: 'bulletlist', label: '列表', icon: <List size={14} /> },
    { type: 'quote', label: '引用', icon: <Quote size={14} /> },
    { type: 'table', label: '表格', icon: <Table size={14} /> },
  ];

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-1"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="flex flex-col gap-1">
        {/* 拖拽手柄 */}
        <button
          className="p-2 hover:bg-gray-100 rounded text-gray-600 cursor-grab active:cursor-grabbing"
          title="拖拽移动"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', blockId);
            // 这里可以添加拖拽开始的逻辑
          }}
        >
          <GripVertical size={14} />
        </button>

        {/* 插入按钮 */}
        <div className="relative">
          <button
            onClick={() => setShowInsertMenu(!showInsertMenu)}
            className="p-2 hover:bg-gray-100 rounded text-gray-600"
            title="插入新块"
          >
            <Plus size={14} />
          </button>
          
          {showInsertMenu && (
            <div className="absolute left-full top-0 ml-2 bg-white shadow-lg rounded-lg border border-gray-200 p-2 min-w-32">
              {insertOptions.map(option => (
                <button
                  key={option.type}
                  onClick={() => insertBlockBefore(option.type)}
                  className="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-100 rounded text-left"
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          )}
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
    </div>
  );
};

export default BlockToolbar;
