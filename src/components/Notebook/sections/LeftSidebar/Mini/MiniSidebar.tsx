import React, { memo, useCallback } from 'react';
import { Trees, PackagePlus, Cog, Folder } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import useStore from '@Store/notebookStore';

interface MiniSidebarItem {
  id: string;
  icon: React.ElementType;
  title: string;
}

interface PhaseStep {
  id: string;
  title: string;
}

interface Phase {
  id: string;
  title: string;
  /** key from @Utils/iconMapping */
  icon: string;
  steps: PhaseStep[];
}

interface MiniSidebarProps {
  /** Legacy OutlineView props */
  phases?: Phase[];
  currentPhaseId?: string;
  onPhaseClick?: (phaseId: string | null) => void;

  /** New general-purpose props */
  onItemClick?: (itemId: string) => void;
  onExpandClick?: () => void;
  activeItemId?: string;

  /** Whether main sidebar is expanded */
  isMainSidebarExpanded?: boolean;
}

/** 功能区（顶部/中部） */
const PRIMARY_ITEMS: MiniSidebarItem[] = [
  { id: 'workspace', icon: Folder, title: 'Workspace' },
  { id: 'knowledge-forest', icon: Trees, title: 'Knowledge Forest' },
  // { id: 'easynet', icon: Network, title: 'EasyNet' },
];

/** 固定底部的功能区（只放设置，避免与中部重复且横排） */
const BOTTOM_ITEMS: MiniSidebarItem[] = [
  { id: 'new-notebook', icon: PackagePlus, title: 'New Notebook' },
  { id: 'settings', icon: Cog, title: 'Settings' },
];

/** 按钮（图标底部对齐，增强的视觉反馈） */
const ItemButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ className = '', children, active, ...props }) => (
  <button
    {...props}
    aria-current={active ? 'page' : undefined}
    className={`app-chrome-button app-rail-button ${className}`}
  >
    {children}
  </button>
);

const MiniSidebar = memo(function MiniSidebar({
  // phases,
  // currentPhaseId,
  onPhaseClick,
  onItemClick,
  onExpandClick,
  activeItemId = 'workspace',
  isMainSidebarExpanded = false,
}: MiniSidebarProps) {
  // const hasPhases = useMemo(() => Array.isArray(phases) && phases.length > 0, [phases]);

  // Get notebookId from store to determine if workspace icon should be shown
  const notebookId = useStore((state) => state.notebookId);

  // Handle logo click - always toggles sidebar
  const handleExpandClick = useCallback(() => {
    if (onExpandClick) onExpandClick();
    else onPhaseClick?.(null);
  }, [onExpandClick, onPhaseClick]);

  // Handle item click - toggle if clicking on currently active item
  const handleItemClick = useCallback(
    (itemId: string) => {
      if (itemId === activeItemId && isMainSidebarExpanded) {
        // Clicking on active item when expanded - collapse sidebar
        if (onExpandClick) onExpandClick();
      } else {
        // Normal item selection
        if (onItemClick) onItemClick(itemId);
      }
    },
    [activeItemId, isMainSidebarExpanded, onItemClick, onExpandClick]
  );

  // Determine what to show in the phases area based on current state
  // const shouldShowPhases = hasPhases && !isMainSidebarExpanded && activeItemId === 'workspace';
  // const shouldShowFolderIcon = hasPhases && ((isMainSidebarExpanded && activeItemId === 'workspace') || activeItemId !== 'workspace');

  return (
    <div className={['w-full h-full', 'flex flex-col', 'relative'].join(' ')}>
      {/* Logo - only controls expand/collapse */}
      <div className="h-[var(--notebook-header-height)] flex items-center justify-center shrink-0">
        <button
          onClick={handleExpandClick}
          className="app-chrome-button translate-y-[2px]"
          title="Expand/Collapse Sidebar"
        >
          <img src="/icon.svg" alt="Easy Notebook" className="w-8 h-8" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-visible pt-[4px]">
        {/* Primary items - show workspace only if notebookId exists */}
        <ul className="space-y-3">
          {PRIMARY_ITEMS.filter((item) => item.id !== 'workspace' || notebookId).map((item) => {
            const Icon = item.icon;
            const isActive = activeItemId === item.id;

            return (
              <li key={item.id} className="flex justify-center overflow-visible">
                <div className="overflow-visible">
                  <ItemButton
                    active={isActive}
                    onClick={() => handleItemClick(item.id)}
                    title={item.title}
                  >
                    <Icon className="app-navigation-icon" />
                  </ItemButton>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bottom items - always show */}
      <div className="py-2 shrink-0">
        <ul className="space-y-3">
          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeItemId === item.id;

            return (
              <li key={item.id} className="flex justify-center overflow-visible">
                <div className="overflow-visible">
                  <ItemButton
                    active={isActive}
                    onClick={() => handleItemClick(item.id)}
                    title={item.title}
                  >
                    <Icon className="app-navigation-icon" />
                  </ItemButton>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Theme Toggle */}
        <div className="flex justify-center mt-2">
          <ThemeToggle collapsed={true} />
        </div>
      </div>
    </div>
  );
});

export default MiniSidebar;
