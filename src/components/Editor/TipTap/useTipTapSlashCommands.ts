import { useState, useCallback, useEffect } from 'react';
import { Editor } from '@tiptap/react';

interface UseTipTapSlashCommandsProps {
  editor: Editor | null;
}

export const useTipTapSlashCommands = ({ editor }: UseTipTapSlashCommandsProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null);

  // 打开命令菜单
  const openMenu = useCallback((position: { x: number; y: number }, query = '') => {
    setMenuPosition(position);
    setSearchQuery(query);
    setIsMenuOpen(true);
  }, []);

  // 关闭命令菜单
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setSearchQuery('');
    setSlashRange(null);
  }, []);

  // 检测斜杠输入
  const detectSlashCommand = useCallback(() => {
    if (!editor) return;

    const { state } = editor;
    const { selection } = state;
    const { $from } = selection;

    // 检查是否在文本节点中
    if (!$from.parent.isTextblock) return;

    // 获取当前行的文本
    const textBefore = $from.parent.textBetween(0, $from.parentOffset);

    // 查找最后一个斜杠的位置
    const slashMatch = textBefore.match(/\/([^/\s]*)$/);

    if (slashMatch) {
      const slashPos = $from.pos - slashMatch[0].length;
      const query = slashMatch[1];

      // 检查斜杠前是否是空格或行首
      const charBeforeSlash = textBefore[textBefore.length - slashMatch[0].length - 1];
      const isValidSlash = !charBeforeSlash || charBeforeSlash === ' ' || charBeforeSlash === '\n';

      if (isValidSlash) {
        const range = {
          from: slashPos,
          to: $from.pos,
        };

        setSlashRange(range);

        // 获取斜杠的屏幕位置
        const coords = editor.view.coordsAtPos(slashPos);
        openMenu({ x: coords.left, y: coords.bottom + 8 }, query);

        return true;
      }
    }

    return false;
  }, [editor, openMenu]);

  // 删除斜杠文本
  const removeSlashText = useCallback(() => {
    if (!editor || !slashRange) return;

    const { from, to } = slashRange;
    editor.chain().focus().deleteRange({ from, to }).run();
    setSlashRange(null);
  }, [editor, slashRange]);

  // 更新斜杠后的查询内容
  const updateSlashQuery = useCallback(
    (newQuery: string) => {
      if (!editor || !slashRange) return;

      const { from } = slashRange;
      const newTo = from + 1 + newQuery.length; // '/' + query length

      // 更新编辑器中的文本
      editor
        .chain()
        .focus()
        .deleteRange({ from, to: slashRange.to })
        .insertContentAt(from, `/${newQuery}`)
        .run();

      // 更新范围和搜索查询
      setSlashRange({ from, to: newTo });
      setSearchQuery(newQuery);
    },
    [editor, slashRange]
  );

  // 监听编辑器输入
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      // 检测斜杠命令
      const detected = detectSlashCommand();

      // 如果没有检测到斜杠命令，关闭菜单
      if (!detected && isMenuOpen) {
        closeMenu();
      }
    };

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor, detectSlashCommand, isMenuOpen, closeMenu]);

  // TipTapSlashCommands owns keyboard navigation and its listener lifecycle.
  // This hook only detects the slash range and controls menu state.

  return {
    isMenuOpen,
    menuPosition,
    searchQuery,
    openMenu,
    closeMenu,
    removeSlashText,
    updateSlashQuery,
    slashRange,
  };
};
