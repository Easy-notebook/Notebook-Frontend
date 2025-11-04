import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Code, 
  Type, 
  Image, 
  Table, 
  Brain, 
  Calculator, 
  Hash,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  FileText,
  Zap
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[];
  action: () => void;
  category: 'basic' | 'advanced' | 'media' | 'ai';
}

interface SlashCommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onCommand: (command: SlashCommand) => void;
  position: { x: number; y: number };
  searchQuery?: string;
}

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  isOpen,
  onClose,
  onCommand,
  position,
  searchQuery = ''
}) => {
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(searchQuery);

  // 定义所有可用的命令
  const commands: SlashCommand[] = [
    // 基础内容
    {
      id: 'text',
      title: '文本',
      description: '开始写作...',
      icon: <Type size={16} />,
      keywords: ['text', 'paragraph', '文本', '段落'],
      action: () => {},
      category: 'basic'
    },
    {
      id: 'heading1',
      title: '标题 1',
      description: '大标题',
      icon: <Heading1 size={16} />,
      keywords: ['h1', 'heading', 'title', '标题', '大标题'],
      action: () => {},
      category: 'basic'
    },
    {
      id: 'heading2',
      title: '标题 2',
      description: '中标题',
      icon: <Heading2 size={16} />,
      keywords: ['h2', 'heading', 'subtitle', '标题', '中标题'],
      action: () => {},
      category: 'basic'
    },
    {
      id: 'heading3',
      title: '标题 3',
      description: '小标题',
      icon: <Heading3 size={16} />,
      keywords: ['h3', 'heading', '标题', '小标题'],
      action: () => {},
      category: 'basic'
    },
    {
      id: 'bulletlist',
      title: '无序列表',
      description: '创建一个简单的无序列表',
      icon: <List size={16} />,
      keywords: ['list', 'bullet', 'ul', '列表', '无序'],
      action: () => {},
      category: 'basic'
    },
    {
      id: 'numberedlist',
      title: '有序列表',
      description: '创建一个编号列表',
      icon: <ListOrdered size={16} />,
      keywords: ['list', 'numbered', 'ol', '列表', '有序', '编号'],
      action: () => {},
      category: 'basic'
    },
    {
      id: 'quote',
      title: '引用',
      description: '创建一个引用块',
      icon: <Quote size={16} />,
      keywords: ['quote', 'blockquote', '引用'],
      action: () => {},
      category: 'basic'
    },
    
    // 代码和技术
    {
      id: 'code',
      title: '代码块',
      description: '创建一个可执行的代码单元格',
      icon: <Code size={16} />,
      keywords: ['code', 'python', 'javascript', '代码', '编程'],
      action: () => {},
      category: 'advanced'
    },
    {
      id: 'math',
      title: '数学公式',
      description: '插入LaTeX数学公式',
      icon: <Calculator size={16} />,
      keywords: ['math', 'latex', 'formula', '数学', '公式'],
      action: () => {},
      category: 'advanced'
    },
    
    // 媒体
    {
      id: 'image',
      title: '图片',
      description: '上传或插入图片',
      icon: <Image size={16} />,
      keywords: ['image', 'photo', 'picture', '图片', '照片'],
      action: () => {},
      category: 'media'
    },
    {
      id: 'table',
      title: '表格',
      description: '插入一个表格',
      icon: <Table size={16} />,
      keywords: ['table', 'grid', '表格'],
      action: () => {},
      category: 'media'
    },
    
    // AI功能
    {
      id: 'ai-thinking',
      title: 'AI思考',
      description: '创建一个AI思考单元格',
      icon: <Brain size={16} />,
      keywords: ['ai', 'thinking', 'assistant', 'AI', '思考', '助手'],
      action: () => {},
      category: 'ai'
    },
    {
      id: 'ai-generate',
      title: 'AI生成',
      description: '让AI生成内容',
      icon: <Zap size={16} />,
      keywords: ['ai', 'generate', 'create', 'AI', '生成', '创建'],
      action: () => {},
      category: 'ai'
    }
  ];

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

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onCommand, onClose]);

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'basic': return 'text-theme-600';
      case 'advanced': return 'text-purple-600';
      case 'media': return 'text-green-600';
      case 'ai': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 min-w-80 max-w-96"
      style={{
        left: position.x,
        top: position.y,
        maxHeight: '400px'
      }}
    >
      {/* 搜索输入框 */}
      <div className="p-3 border-b border-gray-100">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索命令..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-theme-500 focus:border-transparent"
        />
      </div>

      {/* 命令列表 */}
      <div className="max-h-80 overflow-y-auto">
        {filteredCommands.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            没有找到匹配的命令
          </div>
        ) : (
          <div className="py-2">
            {filteredCommands.map((command, index) => (
              <button
                key={command.id}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                  index === selectedIndex ? 'bg-theme-50 border-r-2 border-theme-500' : ''
                }`}
                onClick={() => onCommand(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={`flex-shrink-0 ${getCategoryColor(command.category)}`}>
                  {command.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">
                    {command.title}
                  </div>
                  <div className="text-gray-500 text-xs truncate">
                    {command.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
        <span>↑↓ 导航</span>
        <span>Enter 选择</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
};

export default SlashCommandMenu;
