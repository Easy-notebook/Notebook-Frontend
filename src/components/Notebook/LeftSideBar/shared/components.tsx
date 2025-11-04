/**
 * 共享的 UI 组件
 * 用于保持 LeftSideBar 各个栏目的一致性
 */

import { memo, ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SHARED_STYLES, TabId, TAB_CONFIG } from './constants';

// 状态指示器组件
export const StatusIcon = memo<{ status: 'completed' | 'in-progress' | 'pending' }>(({ status }) => {
  if (status === 'completed') {
    return <CheckCircle2 size={16} className="text-theme-500" />;
  }
  return null;
});

StatusIcon.displayName = 'StatusIcon';

// 状态圆点组件
export const StatusDot = memo<{ 
  status: 'completed' | 'in-progress' | 'pending';
  size?: 'sm' | 'md' | 'lg';
}>(({ status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4', 
    lg: 'w-5 h-5'
  };

  return (
    <div className={`
      ${sizeClasses[size]} rounded-full flex-shrink-0
      ${SHARED_STYLES.status.steps[status]}
    `} />
  );
});

StatusDot.displayName = 'StatusDot';

// Obsidian风格通用按钮组件
export const SidebarButton = memo<{
  children: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}>(({ children, isActive = false, onClick, className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 rounded-md group
        ${SHARED_STYLES.button.base}
        ${sizeClasses[size]}
        ${isActive
          ? SHARED_STYLES.button.active
          : `${SHARED_STYLES.button.inactive} ${SHARED_STYLES.button.hover}`
        }
        ${className}
      `}
    >
      {children}
      {isActive && (
        <div className="ml-auto w-1.5 h-1.5 bg-slate-600 rounded-full" />
      )}
    </button>
  );
});

SidebarButton.displayName = 'SidebarButton';

// Obsidian风格Tab切换组件
export const TabSwitcher = memo<{
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
}>(({ activeTab, onTabChange, className = '' }) => {
  return (
    <div className={`flex space-x-0.5 bg-slate-100/60 p-1 rounded-lg ${className}`}>
      {TAB_CONFIG.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            ${SHARED_STYLES.tab.base}
            ${activeTab === tab.id
              ? SHARED_STYLES.tab.active
              : SHARED_STYLES.tab.inactive
            }
            relative overflow-hidden
          `}
        >
          <span className="relative z-10">{tab.label}</span>
          {activeTab === tab.id && (
            <div className="absolute inset-0 bg-white shadow-sm rounded-md border border-slate-300/50" />
          )}
        </button>
      ))}
    </div>
  );
});

TabSwitcher.displayName = 'TabSwitcher';

// 侧边栏容器组件
export const SidebarContainer = memo<{
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
}>(({ children, onMouseEnter, onMouseLeave, className = '' }) => {
  return (
    <div
      className={`${SHARED_STYLES.container.base} ${className}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
});

SidebarContainer.displayName = 'SidebarContainer';

// 侧边栏头部组件
export const SidebarHeader = memo<{
  children: ReactNode;
  className?: string;
}>(({ children, className = '' }) => {
  return (
    <div className={`${SHARED_STYLES.container.header} ${className}`}>
      {children}
    </div>
  );
});

SidebarHeader.displayName = 'SidebarHeader';

// 侧边栏内容区域组件
export const SidebarContent = memo<{
  children: ReactNode;
  className?: string;
}>(({ children, className = '' }) => {
  return (
    <div className={`${SHARED_STYLES.container.content} ${className}`}>
      <style>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
        }
      `}</style>
      {children}
    </div>
  );
});

SidebarContent.displayName = 'SidebarContent';

// 加载指示器组件
export const LoadingIndicator = memo<{
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}>(({ text = 'Loading...', size = 'md' }) => {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  return (
    <div className="py-4 px-3 flex justify-center items-center h-full">
      <div className={`animate-pulse text-theme-600 ${sizeClasses[size]}`}>
        {text}
      </div>
    </div>
  );
});

LoadingIndicator.displayName = 'LoadingIndicator';

// 运行状态指示器
export const RunningIndicator = memo(() => (
  <div className="flex items-center">
    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></div>
    <span className="text-xs text-green-600">Running</span>
  </div>
));

RunningIndicator.displayName = 'RunningIndicator';

// 任务计数器
export const TaskCounter = memo<{ count: number }>(({ count }) => (
  <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
    {count}
  </span>
));

TaskCounter.displayName = 'TaskCounter';
