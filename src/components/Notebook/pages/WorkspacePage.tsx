// src/components/Notebook/pages/WorkspacePage.tsx
// Workspace page component

import MainContent from '../MainContainer/MainContent';

interface WorkspacePageProps {
  cells: any[];
  viewMode: string;
  tasks: any[];
  currentPhaseId: string | null;
  currentStepIndex: number;
  getCurrentViewCells: () => any[];
  handleAddCell: (type: any, index?: number) => Promise<void>;
  renderCell: (cell: any) => JSX.Element | null;
  renderStepNavigation: () => JSX.Element | null;
  handlePreviousStep: () => void;
  handleNextStep: () => void;
  handlePreviousPhase: () => void;
  handleNextPhase: () => void;
  isFirstPhase: boolean;
  isLastPhase: boolean;
}

export const WorkspacePage = (props: WorkspacePageProps) => {
  return <MainContent {...props} />;
};
