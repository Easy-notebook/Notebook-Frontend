// src/components/Notebook/components/RightSidebar.tsx
// Right sidebar with resizer

import AIAgentSidebarOrig from '../RightSideBar/AIAgentSidebar';
import { RightSidebarResizer } from './RightSidebarResizer';
import { Card } from '@/components/UI/card';

// Cast component to any to relax prop type constraints
const AIAgentSidebar: any = AIAgentSidebarOrig;

interface RightSidebarProps {
  isCollapsed: boolean;
  width: number;
  viewMode: string;
  currentPhaseId: string | null;
  currentStepIndex: number;
  onResize: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const RightSidebar = ({
  isCollapsed,
  width,
  viewMode,
  currentPhaseId,
  currentStepIndex,
  onResize,
}: RightSidebarProps) => {
  if (!isCollapsed) return null;

  return (
    <div className="flex h-full">
      <RightSidebarResizer onMouseDown={onResize} />
      <Card
        className="overflow-hidden transition-all duration-500 ease-in-out opacity-100 flex-shrink-0"
        style={{ width: `${width}px` }}
      >
        <AIAgentSidebar
          viewMode={viewMode}
          currentPhaseId={currentPhaseId}
          currentStepIndex={currentStepIndex}
        />
      </Card>
    </div>
  );
};
