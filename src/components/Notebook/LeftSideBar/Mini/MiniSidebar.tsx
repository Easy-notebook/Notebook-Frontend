import React, { memo, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  Trees,
  PackagePlus,
  Cog,
  Network,
  Folder,
  type LucideIcon,
} from 'lucide-react';
import iconMapping from '@Utils/iconMapping';

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

/** 按钮（图标底部对齐，去除多余 margin/padding） */
const ItemButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ className = '', children, active, ...props }) => (
  <button
    {...props}
    aria-current={active ? 'page' : undefined}
    className={[
      'w-8 h-8',
      'relative rounded-lg transition-colors',
      'flex items-end justify-center',
      active ? 'text-theme-600' : 'text-gray-500',
      className,
    ].join(' ')}
  >
    {children}
  </button>
);

const MiniSidebar = memo(function MiniSidebar({
  phases,
  currentPhaseId,
  onPhaseClick,
  onItemClick,
  onExpandClick,
  activeItemId = 'workspace',
  isMainSidebarExpanded = false,
}: MiniSidebarProps) {
  const hasPhases = useMemo(() => Array.isArray(phases) && phases.length > 0, [phases]);

  const handleExpandClick = useCallback(() => {
    if (onExpandClick) onExpandClick();
    else onPhaseClick?.(null);
  }, [onExpandClick, onPhaseClick]);

  // Determine what to show in the phases area based on current state
  const shouldShowPhases = hasPhases && !isMainSidebarExpanded && activeItemId === 'workspace';
  const shouldShowFolderIcon = hasPhases && ((isMainSidebarExpanded && activeItemId === 'workspace') || activeItemId !== 'workspace');

  return (
    <nav
      className={[
        'w-16 h-full',
        'flex flex-col',
        'bg-white',
        'border-black',
        'border-r',
      ].join(' ')}
    >
      {/* Logo - only controls expand/collapse */}
      <div className="h-12 flex items-center justify-center shrink-0 mt-2">
        <button
          onClick={handleExpandClick}
          className="rounded-lg transition-colors"
          title="Expand/Collapse Sidebar"
        >
          <img src="/icon.svg" className="w-8 h-8"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-visible">
        {/* Phases area - only show when workspace is active and sidebar is collapsed */}
        {shouldShowPhases && (
          <div className="relative -mr-2 my-0">
            <div 
              className="absolute inset-0 bg-white rounded-l-3xl"
              style={{
                borderRight: 'none'
              }}
            />
            
            {/* Phase icons list */}
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
                        <IconComp size={18} />
                      </ItemButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Folder icon - show when sidebar is expanded OR when active item is not workspace */}
        {shouldShowFolderIcon && (
          <div className="relative -mr-2 my-0">
            <div 
              className="absolute inset-0 bg-white rounded-l-3xl"
              style={{
                border: '1px solid rgba(0,0,0,0.04)',
                borderRight: 'none'
              }}
            />
            
            <ul className="space-y-1 relative z-10 py-3 pl-3 pr-4">
              <li className="flex justify-center overflow-visible">
                <div className="overflow-visible relative">
                  <ItemButton
                    active={activeItemId === 'workspace'}
                    onClick={() => onItemClick?.('workspace')}
                    title="Workspace"
                  >
                    <Folder size={18} />                        
                  </ItemButton>
                </div>
              </li>
            </ul>
          </div>
        )}

        {/* Primary items - show non-workspace items */}
        <ul className="space-y-1">
          {PRIMARY_ITEMS.filter(item => item.id !== 'workspace').map((item) => {
            const Icon = item.icon;
            const isActive = activeItemId === item.id;

            return (
              <li key={item.id} className="flex justify-center overflow-visible">
                <div className="overflow-visible">
                  <ItemButton
                    active={isActive}
                    onClick={() => onItemClick?.(item.id)}
                    title={item.title}
                  >
                    <Icon size={18} />
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
                    onClick={() => onItemClick?.(item.id)}
                    title={item.title}
                  >
                    <Icon size={18} />
                  </ItemButton>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
});

export default MiniSidebar;