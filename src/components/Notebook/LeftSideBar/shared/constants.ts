/**
 * 共享的样式常量和布局配置
 * 用于保持 LeftSideBar 各个栏目的一致性
 */

// Obsidian风格的状态样式配置
export const SHARED_STYLES = {
  status: {
    colors: {
      completed: 'text-emerald-600 bg-emerald-50/80 backdrop-blur-md border border-emerald-200/50',
      'in-progress': 'text-theme-600 bg-theme-50/80 backdrop-blur-md border border-theme-200/50',
      pending: 'text-slate-500 bg-slate-50/80 backdrop-blur-md border border-slate-200/50'
    },
    steps: {
      completed: 'bg-emerald-500 shadow-sm ring-1 ring-emerald-200',
      'in-progress': 'bg-theme-500 shadow-sm ring-1 ring-theme-200 animate-pulse',
      pending: 'bg-slate-300 shadow-sm ring-1 ring-slate-200'
    }
  },

  // Obsidian风格按钮样式
  button: {
    base: 'transition-all duration-200 ease-out font-medium text-sm',
    hover: 'hover:bg-slate-100/80 hover:text-slate-700',
    active: 'bg-slate-200/80 text-slate-800 shadow-sm ring-1 ring-slate-300/50',
    inactive: 'text-slate-600 hover:text-slate-700'
  },

  // Obsidian风格容器样式
  container: {
    base: 'relative h-full flex flex-col bg-white border-r border-slate-200/60 shadow-sm',
    header: 'h-14 flex items-center justify-between px-4 border-b border-slate-200/60 bg-slate-50/50 backdrop-blur-sm',
    content: 'flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300/50 scrollbar-track-transparent hover:scrollbar-thumb-slate-400/60'
  },

  // Obsidian风格Tab样式
  tab: {
    base: 'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ease-out',
    active: 'bg-slate-200/80 text-slate-800 shadow-sm ring-1 ring-slate-300/50',
    inactive: 'text-slate-600 hover:bg-slate-100/60 hover:text-slate-700'
  }
};

// 布局常量
export const LAYOUT_CONSTANTS = {
  // 侧边栏尺寸
  sidebar: {
    collapsed: 48,
    minWidth: 280,
    defaultWidth: 384
  },
  
  // 头部高度
  header: {
    height: 64,
    padding: 20
  },
  
  // 间距配置
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20
  },
  
  // 动画时长
  animation: {
    fast: 200,
    normal: 300,
    slow: 500
  },
  
  // 文件树配置
  fileTree: {
    indent: 28,
    iconSize: 18,
    padding: 8
  }
};

// Obsidian风格滚动条样式（CSS-in-JS）
export const SCROLLBAR_STYLES = `
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
  }
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.4);
    border-radius: 3px;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.6);
    border-color: rgba(148, 163, 184, 0.3);
  }
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
  }
`;

// Tab 配置
export const TAB_CONFIG = [
  { id: 'outline', label: 'Outline', icon: null },
  { id: 'file', label: 'Files', icon: null },
  { id: 'agents', label: 'Agents', icon: null }
] as const;

export type TabId = typeof TAB_CONFIG[number]['id'];

// 预览文件类型配置
export const FILE_PREVIEW_CONFIG = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
  text: ['.txt', '.md', '.json', '.js', '.py', '.html', '.css', '.csv', '.xlsx', '.xls'],
  pdf: ['.pdf'],
  doc: ['.doc', '.docx'],
  maxFileSize: 50 * 1024 * 1024, // 50MB (increased to support larger DOC/DOCX files)
  maxFiles: 10
};
