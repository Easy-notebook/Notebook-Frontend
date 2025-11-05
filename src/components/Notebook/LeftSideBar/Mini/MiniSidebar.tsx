import React, { memo, useCallback } from 'react';
import { Trees, PackagePlus, Cog, Network, Folder } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

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
  { id: 'easynet', icon: Network, title: 'EasyNet' },
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
    className={[
      'w-10 h-10',
      'relative rounded-xl',
      'flex items-center justify-center',
      'transition-all duration-200',
      'group',
      active
        ? 'bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-md shadow-primary/20 scale-105'
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:scale-105',
      className,
    ].join(' ')}
  >
    {active && (
      <div
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/30 to-transparent animate-pulse"
        style={{ animationDuration: '2s' }}
      />
    )}
    <div className="relative z-10">{children}</div>
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
    <div className={['w-20 h-full', 'flex flex-col', 'relative'].join(' ')}>
      {/* Logo - only controls expand/collapse */}
      <div className="h-12 flex items-center justify-center shrink-0 mt-2 pb-3">
        <button
          onClick={handleExpandClick}
          className="rounded-lg transition-all hover:scale-110 hover:rotate-3"
          title="Expand/Collapse Sidebar"
        >
          <img src="/icon.svg" className="w-10 h-10" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-visible">
        {/* Phases area - only show when workspace is active and sidebar is collapsed */}
        {/* {shouldShowPhases && (
          <div className="relative -mr-2 my-0">
            <div 
              className="absolute inset-0 bg-white rounded-l-3xl"
              style={{
                borderRight: 'none'
              }}
            />
            
            <ul className="space-y-1 relative z-10 py-3 pl-1 pr-4">
              {phases!.map((phase) => {
                const IconComp =
                  (iconMapping as Record<string, LucideIcon>)[phase.icon] ?? CheckCircle2;
                const isActive = currentPhaseId === phase.id;

                return (
                  <li key={phase.id} className="flex justify-center overflow-visible">
                    <div className="overflow-visible relative">
                      <ItemButton
                        active={isActive}
                        onClick={() => onPhaseClick?.(phase.id)}
                        title={phase.title}
                      >
                        <IconComp size={20} />
                      </ItemButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {shouldShowFolderIcon && 
        ( */}
        {/* Primary items - show all items including workspace */}
        <ul className="space-y-1">
          {PRIMARY_ITEMS.map((item) => {
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
                    <Icon size={20} />
                  </ItemButton>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bottom items - always show */}
      <div className="py-3 shrink-0">
        <ul className="space-y-1">
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
                    <Icon size={20} />
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
