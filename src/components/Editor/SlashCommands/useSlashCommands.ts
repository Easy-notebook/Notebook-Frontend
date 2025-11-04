import { useState, useCallback, useRef, useEffect } from 'react';
import { SlashCommand } from './SlashCommandMenu';

interface UseSlashCommandsProps {
  selectedCellId?: string | null;
  onInsertCellAfter?: (type: string, content?: string) => void;
  onInsertCellBefore?: (type: string, content?: string) => void;
  onUpdateCurrentCell?: (content: string) => void;
  onInsertCodeCell?: () => void;
  onInsertMarkdownCell?: () => void;
  onInsertImageCell?: () => void;
  onInsertThinkingCell?: () => void;
  onInsertTable?: () => void;
  onInsertMath?: () => void;
  onInsertHeading?: (level: number) => void;
  onInsertList?: (ordered: boolean) => void;
  onInsertQuote?: () => void;
  onInsertText?: () => void;
  onAIGenerate?: () => void;
}

export const useSlashCommands = (props: UseSlashCommandsProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [insertPosition, setInsertPosition] = useState<'after' | 'before' | 'replace'>('after');
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // 打开命令菜单
  const openMenu = useCallback((element: HTMLElement, query: string = '', position: 'after' | 'before' | 'replace' = 'after') => {
    const rect = element.getBoundingClientRect();
    setMenuPosition({
      x: rect.left,
      y: rect.bottom + 8
    });
    setSearchQuery(query);
    setInsertPosition(position);
    setIsMenuOpen(true);
    triggerElementRef.current = element;
  }, []);

  // 关闭命令菜单
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setSearchQuery('');
    setInsertPosition('after');
    triggerElementRef.current = null;
  }, []);

  // 处理命令执行
  const handleCommand = useCallback((command: SlashCommand) => {
    closeMenu();

    // 根据插入位置选择不同的处理方式
    const insertFunction = insertPosition === 'before' ? props.onInsertCellBefore : props.onInsertCellAfter;

    switch (command.id) {
      case 'text':
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell('');
        } else {
          insertFunction?.('markdown', '');
        }
        break;
      case 'heading1':
        const h1Content = '# 标题';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(h1Content);
        } else {
          insertFunction?.('markdown', h1Content);
        }
        break;
      case 'heading2':
        const h2Content = '## 标题';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(h2Content);
        } else {
          insertFunction?.('markdown', h2Content);
        }
        break;
      case 'heading3':
        const h3Content = '### 标题';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(h3Content);
        } else {
          insertFunction?.('markdown', h3Content);
        }
        break;
      case 'bulletlist':
        const bulletContent = '- 第一项\n- 第二项\n- 第三项';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(bulletContent);
        } else {
          insertFunction?.('markdown', bulletContent);
        }
        break;
      case 'numberedlist':
        const numberedContent = '1. 第一项\n2. 第二项\n3. 第三项';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(numberedContent);
        } else {
          insertFunction?.('markdown', numberedContent);
        }
        break;
      case 'quote':
        const quoteContent = '> 这是一个引用块';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(quoteContent);
        } else {
          insertFunction?.('markdown', quoteContent);
        }
        break;
      case 'code':
        insertFunction?.('code', '');
        break;
      case 'math':
        const mathContent = '$$\nE = mc^2\n$$';
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(mathContent);
        } else {
          insertFunction?.('markdown', mathContent);
        }
        break;
      case 'image':
        insertFunction?.('image', '');
        break;
      case 'table':
        const tableContent = `| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 行1 | 数据 | 数据 |
| 行2 | 数据 | 数据 |`;
        if (insertPosition === 'replace' && props.onUpdateCurrentCell) {
          props.onUpdateCurrentCell(tableContent);
        } else {
          insertFunction?.('markdown', tableContent);
        }
        break;
      case 'ai-thinking':
        insertFunction?.('thinking', '');
        break;
      case 'ai-generate':
        props.onAIGenerate?.();
        break;
      default:
        console.warn('Unknown command:', command.id);
    }
  }, [props, insertPosition, closeMenu]);

  // 检测斜杠输入
  const handleTextInput = useCallback((event: Event, element: HTMLElement) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target) return;

    const value = target.value;
    const cursorPosition = target.selectionStart || 0;
    
    // 检查光标前的字符是否是斜杠
    if (cursorPosition > 0 && value[cursorPosition - 1] === '/') {
      // 检查斜杠前是否是空格或行首
      const beforeSlash = cursorPosition > 1 ? value[cursorPosition - 2] : '';
      if (beforeSlash === '' || beforeSlash === ' ' || beforeSlash === '\n') {
        openMenu(element);
      }
    }
  }, [openMenu]);

  // 检测键盘快捷键
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ctrl/Cmd + / 打开命令菜单
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault();
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement) {
        openMenu(activeElement);
      }
    }
    
    // 其他快捷键
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'k': // Ctrl/Cmd + K 打开命令菜单
          if (event.shiftKey) {
            event.preventDefault();
            const activeElement = document.activeElement as HTMLElement;
            if (activeElement) {
              openMenu(activeElement);
            }
          }
          break;
        case 'l': // Ctrl/Cmd + Shift + L 插入代码块
          if (event.shiftKey) {
            event.preventDefault();
            props.onInsertCodeCell?.();
          }
          break;
        case 'm': // Ctrl/Cmd + Shift + M 插入markdown
          if (event.shiftKey) {
            event.preventDefault();
            props.onInsertMarkdownCell?.();
          }
          break;
        case 'i': // Ctrl/Cmd + Shift + I 插入图片
          if (event.shiftKey) {
            event.preventDefault();
            props.onInsertImageCell?.();
          }
          break;
        case 't': // Ctrl/Cmd + Shift + T 插入表格
          if (event.shiftKey) {
            event.preventDefault();
            props.onInsertTable?.();
          }
          break;
        case 'b': // Ctrl/Cmd + Shift + B 插入AI思考
          if (event.shiftKey) {
            event.preventDefault();
            props.onInsertThinkingCell?.();
          }
          break;
      }
    }
  }, [openMenu, props]);

  // 注册全局键盘事件监听器
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    isMenuOpen,
    menuPosition,
    searchQuery,
    insertPosition,
    openMenu,
    closeMenu,
    handleCommand,
    handleTextInput,
    triggerElement: triggerElementRef.current
  };
};

// 用于在编辑器中检测斜杠输入的工具函数
export const detectSlashCommand = (text: string, cursorPosition: number): boolean => {
  if (cursorPosition === 0) return false;
  
  const charAtCursor = text[cursorPosition - 1];
  if (charAtCursor !== '/') return false;
  
  // 检查斜杠前是否是空格、换行或行首
  if (cursorPosition === 1) return true;
  
  const charBeforeSlash = text[cursorPosition - 2];
  return charBeforeSlash === ' ' || charBeforeSlash === '\n';
};

// 获取斜杠后的查询文本
export const getSlashQuery = (text: string, cursorPosition: number): string => {
  let slashIndex = -1;
  
  // 从光标位置向前查找最近的斜杠
  for (let i = cursorPosition - 1; i >= 0; i--) {
    if (text[i] === '/') {
      // 检查斜杠前是否是空格、换行或行首
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n') {
        slashIndex = i;
        break;
      }
    } else if (text[i] === ' ' || text[i] === '\n') {
      // 遇到空格或换行，停止查找
      break;
    }
  }
  
  if (slashIndex === -1) return '';
  
  // 返回斜杠后到光标位置的文本
  return text.substring(slashIndex + 1, cursorPosition);
};

export default useSlashCommands;
