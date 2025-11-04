import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsProps {
  onInsertCodeCell?: () => void;
  onInsertMarkdownCell?: () => void;
  onInsertImageCell?: () => void;
  onInsertThinkingCell?: () => void;
  onInsertTable?: () => void;
  onInsertMath?: () => void;
  onDeleteCell?: () => void;
  onRunCell?: () => void;
  onRunAllCells?: () => void;
  onSaveNotebook?: () => void;
  onOpenCommandPalette?: () => void;

  onToggleEditMode?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSelectPreviousCell?: () => void;
  onSelectNextCell?: () => void;
  onCopyCell?: () => void;
  onPasteCell?: () => void;
  onCutCell?: () => void;
  onUndoAction?: () => void;
  onRedoAction?: () => void;
  disabled?: boolean;
}

export const useKeyboardShortcuts = (props: KeyboardShortcutsProps) => {
  const {
    onInsertCodeCell,
    onInsertMarkdownCell,
    onInsertImageCell,
    onInsertThinkingCell,
    onInsertTable,
    onInsertMath,
    onDeleteCell,
    onRunCell,
    onRunAllCells,
    onSaveNotebook,
    onOpenCommandPalette,

    onToggleEditMode,
    onMoveUp,
    onMoveDown,
    onSelectPreviousCell,
    onSelectNextCell,
    onCopyCell,
    onPasteCell,
    onCutCell,
    onUndoAction,
    onRedoAction,
    disabled = false
  } = props;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled) return;

    const { ctrlKey, metaKey, shiftKey, altKey, key } = event;
    const isModifierPressed = ctrlKey || metaKey;

    // 检查是否在输入框中
    const target = event.target as HTMLElement;
    const isInInput = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.contentEditable === 'true' ||
                     target.closest('.cm-editor'); // CodeMirror编辑器

    // 全局快捷键（即使在输入框中也生效）
    if (isModifierPressed) {
      switch (key) {
        case 's': // Ctrl/Cmd + S - 保存
          if (!shiftKey && !altKey) {
            event.preventDefault();
            onSaveNotebook?.();
            return;
          }
          break;
        
        case 'z': // Ctrl/Cmd + Z - 撤销
          if (!shiftKey && !altKey) {
            event.preventDefault();
            onUndoAction?.();
            return;
          }
          break;
        
        case 'y': // Ctrl/Cmd + Y - 重做
          if (!shiftKey && !altKey) {
            event.preventDefault();
            onRedoAction?.();
            return;
          }
          break;
        
        case 'Z': // Ctrl/Cmd + Shift + Z - 重做
          if (shiftKey && !altKey) {
            event.preventDefault();
            onRedoAction?.();
            return;
          }
          break;
      }
    }

    // 如果在输入框中，只处理特定的快捷键
    if (isInInput) {
      if (isModifierPressed && shiftKey) {
        switch (key) {
          case 'L': // Ctrl/Cmd + Shift + L - 插入代码块
            event.preventDefault();
            onInsertCodeCell?.();
            break;
          case 'M': // Ctrl/Cmd + Shift + M - 插入markdown
            event.preventDefault();
            onInsertMarkdownCell?.();
            break;
          case 'I': // Ctrl/Cmd + Shift + I - 插入图片
            event.preventDefault();
            onInsertImageCell?.();
            break;
          case 'T': // Ctrl/Cmd + Shift + T - 插入表格
            event.preventDefault();
            onInsertTable?.();
            break;
          case 'B': // Ctrl/Cmd + Shift + B - 插入AI思考
            event.preventDefault();
            onInsertThinkingCell?.();
            break;
          case 'E': // Ctrl/Cmd + Shift + E - 插入数学公式
            event.preventDefault();
            onInsertMath?.();
            break;
        }
      }
      
      // 在CodeMirror中的特殊快捷键
      if (target.closest('.cm-editor')) {
        if (isModifierPressed && key === 'Enter') {
          // Ctrl/Cmd + Enter - 运行cell
          event.preventDefault();
          onRunCell?.();
        }
      }
      
      return;
    }

    // 非输入框中的快捷键
    if (isModifierPressed) {
      if (shiftKey) {
        switch (key) {
          case 'L': // Ctrl/Cmd + Shift + L - 插入代码块
            event.preventDefault();
            onInsertCodeCell?.();
            break;
          case 'M': // Ctrl/Cmd + Shift + M - 插入markdown
            event.preventDefault();
            onInsertMarkdownCell?.();
            break;
          case 'I': // Ctrl/Cmd + Shift + I - 插入图片
            event.preventDefault();
            onInsertImageCell?.();
            break;
          case 'T': // Ctrl/Cmd + Shift + T - 插入表格
            event.preventDefault();
            onInsertTable?.();
            break;
          case 'B': // Ctrl/Cmd + Shift + B - 插入AI思考
            event.preventDefault();
            onInsertThinkingCell?.();
            break;
          case 'E': // Ctrl/Cmd + Shift + E - 插入数学公式
            event.preventDefault();
            onInsertMath?.();
            break;
          case 'P': // Ctrl/Cmd + Shift + P - 打开命令面板
            event.preventDefault();
            onOpenCommandPalette?.();
            break;

          case 'Enter': // Ctrl/Cmd + Shift + Enter - 运行所有cells
            event.preventDefault();
            onRunAllCells?.();
            break;
        }
      } else {
        switch (key) {
          case 'Enter': // Ctrl/Cmd + Enter - 运行当前cell
            event.preventDefault();
            onRunCell?.();
            break;
          case 'c': // Ctrl/Cmd + C - 复制cell
            event.preventDefault();
            onCopyCell?.();
            break;
          case 'v': // Ctrl/Cmd + V - 粘贴cell
            event.preventDefault();
            onPasteCell?.();
            break;
          case 'x': // Ctrl/Cmd + X - 剪切cell
            event.preventDefault();
            onCutCell?.();
            break;
        }
      }
    } else if (altKey) {
      switch (key) {
        case 'ArrowUp': // Alt + ↑ - 向上移动cell
          event.preventDefault();
          onMoveUp?.();
          break;
        case 'ArrowDown': // Alt + ↓ - 向下移动cell
          event.preventDefault();
          onMoveDown?.();
          break;
      }
    } else {
      // 无修饰键的快捷键
      switch (key) {
        case 'Delete': // Delete - 删除cell
        case 'Backspace': // Backspace - 删除cell
          event.preventDefault();
          onDeleteCell?.();
          break;
        case 'Enter': // Enter - 切换编辑模式
          event.preventDefault();
          onToggleEditMode?.();
          break;
        case 'ArrowUp': // ↑ - 选择上一个cell
          event.preventDefault();
          onSelectPreviousCell?.();
          break;
        case 'ArrowDown': // ↓ - 选择下一个cell
          event.preventDefault();
          onSelectNextCell?.();
          break;
        case 'Escape': // Esc - 退出编辑模式
          event.preventDefault();
          onToggleEditMode?.();
          break;
      }
    }
  }, [
    disabled,
    onInsertCodeCell,
    onInsertMarkdownCell,
    onInsertImageCell,
    onInsertThinkingCell,
    onInsertTable,
    onInsertMath,
    onDeleteCell,
    onRunCell,
    onRunAllCells,
    onSaveNotebook,
    onOpenCommandPalette,

    onToggleEditMode,
    onMoveUp,
    onMoveDown,
    onSelectPreviousCell,
    onSelectNextCell,
    onCopyCell,
    onPasteCell,
    onCutCell,
    onUndoAction,
    onRedoAction,
  ]);

  useEffect(() => {
    if (!disabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [handleKeyDown, disabled]);

  // 返回快捷键说明
  const shortcuts = {
    global: [
      { keys: ['Ctrl/Cmd', 'S'], description: '保存笔记本' },
      { keys: ['Ctrl/Cmd', 'Z'], description: '撤销' },
      { keys: ['Ctrl/Cmd', 'Y'], description: '重做' },
      { keys: ['Ctrl/Cmd', 'Shift', 'Z'], description: '重做' },
    ],
    cell: [
      { keys: ['Ctrl/Cmd', 'Shift', 'L'], description: '插入代码块' },
      { keys: ['Ctrl/Cmd', 'Shift', 'M'], description: '插入文本块' },
      { keys: ['Ctrl/Cmd', 'Shift', 'I'], description: '插入图片' },
      { keys: ['Ctrl/Cmd', 'Shift', 'T'], description: '插入表格' },
      { keys: ['Ctrl/Cmd', 'Shift', 'B'], description: '插入AI思考' },
      { keys: ['Ctrl/Cmd', 'Shift', 'E'], description: '插入数学公式' },
      { keys: ['Ctrl/Cmd', 'Enter'], description: '运行当前cell' },
      { keys: ['Ctrl/Cmd', 'Shift', 'Enter'], description: '运行所有cells' },
      { keys: ['Delete'], description: '删除cell' },
      { keys: ['Enter'], description: '编辑cell' },
      { keys: ['Esc'], description: '退出编辑' },
      { keys: ['↑'], description: '选择上一个cell' },
      { keys: ['↓'], description: '选择下一个cell' },
      { keys: ['Alt', '↑'], description: '向上移动cell' },
      { keys: ['Alt', '↓'], description: '向下移动cell' },
    ],
    command: [
      { keys: ['Ctrl/Cmd', '/'], description: '打开命令面板' },
      { keys: ['Ctrl/Cmd', 'Shift', 'P'], description: '打开命令面板' },

    ]
  };

  return { shortcuts };
};

export default useKeyboardShortcuts;
