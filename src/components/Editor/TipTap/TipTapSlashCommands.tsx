import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Editor } from '@tiptap/react';
import { 
  Code, 
  Type, 
  Heading1, 
  Heading2, 
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table,
  Calculator,
  Image,
  Brain,
  Video,
} from 'lucide-react';

import './types';

interface TipTapCommand {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[];
  action: (editor: Editor, query?: string) => void;
}

interface TipTapSlashCommandsProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  searchQuery?: string;
  onQueryUpdate?: (query: string) => void;
}

const TipTapSlashCommands: React.FC<TipTapSlashCommandsProps> = ({
  editor,
  isOpen,
  onClose,
  position,
  searchQuery = '',
  onQueryUpdate
}) => {
  const [filteredCommands, setFilteredCommands] = useState<TipTapCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(searchQuery);

  // 定义TipTap可用的命令
  const commands: TipTapCommand[] = [
    {
      id: 'paragraph',
      title: '段落',
      description: '普通文本段落',
      icon: <Type size={16} />,
      keywords: ['text', 'paragraph', '文本', '段落', 'txt'],
      action: (editor) => {
        editor.chain().focus().setParagraph().run();
      }
    },
    {
      id: 'heading1',
      title: '标题 1',
      description: '大标题',
      icon: <Heading1 size={16} />,
      keywords: ['h1', 'heading', 'title', '标题', '大标题'],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
      }
    },
    {
      id: 'heading2',
      title: '标题 2',
      description: '中标题',
      icon: <Heading2 size={16} />,
      keywords: ['h2', 'heading', 'subtitle', '标题', '中标题'],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      }
    },
    {
      id: 'heading3',
      title: '标题 3',
      description: '小标题',
      icon: <Heading3 size={16} />,
      keywords: ['h3', 'heading', '标题', '小标题'],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      }
    },
    {
      id: 'bulletlist',
      title: '无序列表',
      description: '创建无序列表',
      icon: <List size={16} />,
      keywords: ['list', 'bullet', 'ul', '列表', '无序'],
      action: (editor) => {
        editor.chain().focus().toggleBulletList().run();
      }
    },
    {
      id: 'orderedlist',
      title: '有序列表',
      description: '创建编号列表',
      icon: <ListOrdered size={16} />,
      keywords: ['list', 'numbered', 'ol', '列表', '有序', '编号'],
      action: (editor) => {
        editor.chain().focus().toggleOrderedList().run();
      }
    },
    {
      id: 'blockquote',
      title: '引用',
      description: '创建引用块',
      icon: <Quote size={16} />,
      keywords: ['quote', 'blockquote', '引用'],
      action: (editor) => {
        editor.chain().focus().toggleBlockquote().run();
      }
    },
    {
      id: 'codeblock',
      title: '代码块',
      description: '插入代码块',
      icon: <Code size={16} />,
      keywords: ['code', 'codeblock', '代码'],
      action: (editor) => {
        const newId = uuidv4();
        try {
          editor.chain().focus().insertExecutableCodeBlock({
            language: 'python',
            code: '',
            cellId: newId,
            outputs: [],
            enableEdit: true,
          }).run();
        } catch {
          editor.chain().focus().insertContent({
            type: 'executableCodeBlock',
            attrs: { language: 'python', code: '', cellId: newId, outputs: [], enableEdit: true }
          }).run();
        }
        setTimeout(() => {
          const codeElement = document.querySelector(`[data-cell-id="${newId}"] .cm-editor .cm-content`);
          if (codeElement) (codeElement as HTMLElement).focus();
        }, 60);
      }
    },
    {
      id: 'table',
      title: '表格',
      description: '插入表格',
      icon: <Table size={16} />,
      keywords: ['table', 'grid', '表格'],
      action: (editor) => {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      }
    },
    {
      id: 'math',
      title: '数学公式',
      description: '插入LaTeX数学公式',
      icon: <Calculator size={16} />,
      keywords: ['math', 'latex', 'formula', '数学', '公式'],
      action: (editor) => {
        try {
          editor.chain().focus().setLaTeX({
            latex: 'E = mc^2',
            displayMode: true
          }).run();
        } catch {
          // fallback: 插入普通文本
          editor.chain().focus().insertContent('$$E = mc^2$$').run();
        }
      }
    },
    {
      id: 'image',
      title: '图片',
      description: '插入图片 /image [url]',
      icon: <Image size={16} />,
      keywords: ['image', 'photo', 'picture', '图片', '照片', 'img'],
      action: (editor, query) => {
        // 检查查询中是否已包含URL参数
        const imageMatch = query?.match(/^image\s+(.+)$/);
        let url = imageMatch ? imageMatch[1].trim() : null;

        // 如果没有URL参数，弹出输入框
        if (!url) {
          url = prompt('请输入图片URL:');
        }

        if (url) {
          try {
            editor.chain().focus().setImage({
              src: url,
              alt: '图片',
              title: '图片'
            }).run();
          } catch {
            // fallback: 插入普通文本
            editor.chain().focus().insertContent(`![图片](${url})`).run();
          }
        }
      }
    },
    {
      id: 'raw',
      title: '原始文本',
      description: '插入原始文本单元（不解析为Markdown）',
      icon: <Code size={16} />,
      keywords: ['raw', 'text', 'plain', '原始', '文本'],
      action: (editor) => {
        try {
          editor.chain().focus().insertContent({ type: 'rawBlock', attrs: { content: '' } }).run();
        } catch {
          editor.chain().focus().insertContent('<div data-type="raw-block" data-content=""></div>').run();
        }
      }
    },
    {
      id: 'video',
      title: '视频',
      description: '插入视频 /video [url]',
      icon: <Video size={16} />,
      keywords: ['video', 'movie', 'mp4', '视频', '影片', 'vid'],
      action: (editor, query) => {
        // 检查查询中是否已包含URL参数
        const videoMatch = query?.match(/^video\s+(.+)$/);
        let url = videoMatch ? videoMatch[1].trim() : null;
        
        // 如果没有URL参数，弹出输入框
        if (!url) {
          url = prompt('请输入视频URL:');
        }
        
        if (url) {
          // 插入视频HTML
          editor.chain().focus().insertContent(`
            <div class="video-container">
              <video controls style="max-width: 100%; height: auto;">
                <source src="${url}" type="video/mp4">
                您的浏览器不支持视频标签。
              </video>
            </div>
          `).run();
        }
      }
    },
    {
      id: 'thinking',
      title: 'AI思考',
      description: '插入AI思考块',
      icon: <Brain size={16} />,
      keywords: ['ai', 'thinking', 'assistant', 'AI', '思考', '助手'],
      action: (editor) => {
        try {
          editor.chain().focus().insertThinkingCell({
            cellId: `thinking-${Date.now()}`,
            agentName: 'AI',
            customText: null,
            textArray: [],
            useWorkflowThinking: false,
          }).run();
        } catch {
          // fallback: 插入普通文本
          editor.chain().focus().insertContent('<div class="thinking-placeholder">🤖 AI思考区域</div>').run();
        }
      }
    }
  ];

  // 处理查询更新
  const handleQueryUpdate = (newQuery: string) => {
    setQuery(newQuery);
    if (onQueryUpdate) {
      onQueryUpdate(newQuery);
    }
  };

  // 过滤命令
  useEffect(() => {
    const filtered = commands.filter(command => {
      if (!query.trim()) return true;
      
      const searchTerm = query.toLowerCase();
      return (
        command.title.toLowerCase().includes(searchTerm) ||
        command.description.toLowerCase().includes(searchTerm) ||
        command.keywords.some(keyword => keyword.toLowerCase().includes(searchTerm))
      );
    });
    
    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, [query]);

  // 同步外部 searchQuery 到内部 query
  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  // 键盘导航 - 增强事件处理，支持字符输入过滤
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // 处理导航和控制键
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          if (filteredCommands.length > 0) {
            setSelectedIndex(prev => {
              const nextIndex = prev < filteredCommands.length - 1 ? prev + 1 : 0;
              return nextIndex;
            });
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          if (filteredCommands.length > 0) {
            setSelectedIndex(prev => {
              const nextIndex = prev > 0 ? prev - 1 : filteredCommands.length - 1;
              return nextIndex;
            });
          }
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredCommands[selectedIndex] && editor) {
            filteredCommands[selectedIndex].action(editor, query);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (filteredCommands.length > 0) {
            setSelectedIndex(prev => 
              prev < filteredCommands.length - 1 ? prev + 1 : 0
            );
          }
          break;
        case 'Backspace':
          e.preventDefault();
          e.stopPropagation();
          // 删除查询字符
          if (query.length > 0) {
            const newQuery = query.slice(0, -1);
            handleQueryUpdate(newQuery);
          } else {
            onClose();
          }
          break;
        default:
          // 处理普通字符输入
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            const newQuery = query + e.key;
            handleQueryUpdate(newQuery);
          }
          break;
      }
    };

    // 使用 capture 阶段来确保我们能拦截到事件
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filteredCommands, selectedIndex, editor, onClose, query, handleQueryUpdate]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // 确保菜单获得焦点以接收键盘事件
  useEffect(() => {
    if (isOpen && menuRef.current) {
      // 给菜单设置焦点，但不显示焦点轮廓
      menuRef.current.focus();
      console.log('Menu focused');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-theme border border-theme-200 min-w-72 max-w-80 focus:outline-none slash-command-menu"
      tabIndex={-1} // 允许接收焦点但不参与Tab导航
      style={{
        left: position.x,
        top: position.y,
        maxHeight: '320px',
      }}
    >
      {/* 搜索状态显示 */}
      {query && (
        <div className="px-3 py-2 border-b border-theme-100 bg-theme-25">
          <div className="text-xs text-theme-600 font-medium flex items-center gap-2">
            <span className="font-mono bg-white px-2 py-1 rounded border">/{query}</span>
          </div>
        </div>
      )}

      {/* 命令列表 */}
      <div className="max-h-80 overflow-y-auto">
        {filteredCommands.length === 0 ? (
          null
        ) : (
          <div className="py-1">
            {filteredCommands.map((command, index) => (
              <button
                key={command.id}
                className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-all duration-200 command-item ${
                  index === selectedIndex 
                    ? 'command-item-selected' 
                    : 'text-gray-700'
                }`}
                onClick={() => {
                  if (editor) {
                    command.action(editor, query);
                    onClose();
                  }
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={`flex-shrink-0 ${
                  index === selectedIndex ? 'text-theme-600' : 'text-gray-500'
                }`}>
                  {command.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${
                    index === selectedIndex ? 'text-theme-900' : 'text-gray-900'
                  }`}>
                    {command.title}
                  </div>
                  <div className={`text-xs truncate ${
                    index === selectedIndex ? 'text-theme-600' : 'text-gray-500'
                  }`}>
                    {command.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TipTapSlashCommands;
