import { useState, useCallback, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';

interface UseBlockManagerProps {
  editor: Editor | null;
}

export const useBlockManager = ({ editor }: UseBlockManagerProps) => {
  const [hoveredBlock, setHoveredBlock] = useState<{
    blockId: string;
    element: HTMLElement;
  } | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 处理块悬停
  const handleBlockHover = useCallback((blockId: string, element: HTMLElement) => {
    // 清除之前的超时
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // 设置新的悬停状态
    setHoveredBlock({ blockId, element });
  }, []);

  // 处理块取消悬停
  const handleBlockUnhover = useCallback(() => {
    // 延迟隐藏，避免鼠标移动到工具栏时立即隐藏
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredBlock(null);
    }, 100);
  }, []);

  // 处理块选中
  const handleBlockSelect = useCallback((blockId: string) => {
    setSelectedBlock(blockId);
  }, []);

  // 处理拖拽开始
  const handleBlockDragStart = useCallback((blockId: string) => {
    setIsDragging(true);
    setSelectedBlock(blockId);
  }, []);

  // 处理拖拽结束
  const handleBlockDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 关闭工具栏
  const closeToolbar = useCallback(() => {
    setHoveredBlock(null);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);

  // 获取块的位置信息
  const getBlockPosition = useCallback((blockId: string) => {
    if (!editor) return null;
    
    const pos = parseInt(blockId.replace('block-', ''));
    const node = editor.state.doc.nodeAt(pos);
    
    return node ? { pos, node } : null;
  }, [editor]);

  // 移动块
  const moveBlock = useCallback((fromBlockId: string, toBlockId: string) => {
    if (!editor) return;

    const fromInfo = getBlockPosition(fromBlockId);
    const toInfo = getBlockPosition(toBlockId);

    if (!fromInfo || !toInfo) return;

    const { pos: fromPos, node: fromNode } = fromInfo;
    const { pos: toPos } = toInfo;

    const tr = editor.state.tr;
    
    // 删除原始节点
    tr.delete(fromPos, fromPos + fromNode.nodeSize);
    
    // 计算新的插入位置
    let insertPos = toPos;
    if (fromPos < toPos) {
      insertPos = toPos - fromNode.nodeSize;
    }
    
    // 插入到新位置
    tr.insert(insertPos, fromNode);
    
    editor.view.dispatch(tr);
  }, [editor, getBlockPosition]);

  // 在指定块之前插入新块
  const insertBlockBefore = useCallback((blockId: string, content: string) => {
    if (!editor) return;

    const blockInfo = getBlockPosition(blockId);
    if (!blockInfo) return;

    editor.chain().focus().insertContentAt(blockInfo.pos, content).run();
  }, [editor, getBlockPosition]);

  // 在指定块之后插入新块
  const insertBlockAfter = useCallback((blockId: string, content: string) => {
    if (!editor) return;

    const blockInfo = getBlockPosition(blockId);
    if (!blockInfo) return;

    const insertPos = blockInfo.pos + blockInfo.node.nodeSize;
    editor.chain().focus().insertContentAt(insertPos, content).run();
  }, [editor, getBlockPosition]);

  // 删除块
  const deleteBlock = useCallback((blockId: string) => {
    if (!editor) return;

    const blockInfo = getBlockPosition(blockId);
    if (!blockInfo) return;

    const { pos, node } = blockInfo;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }, [editor, getBlockPosition]);

  // 复制块
  const duplicateBlock = useCallback((blockId: string) => {
    if (!editor) return;

    const blockInfo = getBlockPosition(blockId);
    if (!blockInfo) return;

    const { pos, node } = blockInfo;
    const insertPos = pos + node.nodeSize;
    
    // 创建节点的副本
    const duplicatedNode = node.copy(node.content);
    editor.chain().focus().insertContentAt(insertPos, duplicatedNode.toJSON()).run();
  }, [editor, getBlockPosition]);

  // 设置拖拽事件监听器
  useEffect(() => {
    if (!editor) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      
      const draggedBlockId = e.dataTransfer?.getData('text/plain');
      const target = e.target as HTMLElement;
      const targetBlock = target.closest('.tiptap-block');
      const targetBlockId = targetBlock?.getAttribute('data-block-id');

      if (draggedBlockId && targetBlockId && draggedBlockId !== targetBlockId) {
        moveBlock(draggedBlockId, targetBlockId);
      }

      setIsDragging(false);
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('dragover', handleDragOver);
    editorElement.addEventListener('drop', handleDrop);

    return () => {
      editorElement.removeEventListener('dragover', handleDragOver);
      editorElement.removeEventListener('drop', handleDrop);
    };
  }, [editor, moveBlock]);

  // 清理超时
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return {
    hoveredBlock,
    selectedBlock,
    isDragging,
    handleBlockHover,
    handleBlockUnhover,
    handleBlockSelect,
    handleBlockDragStart,
    handleBlockDragEnd,
    closeToolbar,
    moveBlock,
    insertBlockBefore,
    insertBlockAfter,
    deleteBlock,
    duplicateBlock,
  };
};
