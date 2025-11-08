// src/components/Notebook/components/RightSidebar.tsx
// Right sidebar content - simplified for use with ThreePanelLayout

import AIAgentSidebarOrig from '../RightSideBar/AIAgentSidebar';

// Cast component to any to relax prop type constraints
const AIAgentSidebar: any = AIAgentSidebarOrig;

interface RightSidebarProps {
  viewMode: string;
  currentPhaseId: string | null;
  currentStepIndex: number;
}

export const RightSidebar = ({ viewMode, currentPhaseId, currentStepIndex }: RightSidebarProps) => {
  // AIAgentSidebar already has its own container, just pass through
  return (
    <AIAgentSidebar
      viewMode={viewMode}
      currentPhaseId={currentPhaseId}
      currentStepIndex={currentStepIndex}
    />
  );
};
