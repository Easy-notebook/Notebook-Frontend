// src/components/Notebook/pages/WorkspacePage.tsx
// Workspace page component - renders actual workspace content (cells)

import CreateMode from '@/components/Scenario/View/CreateMode';
import DemoMode from '@/components/Scenario/View/DemoMode';
import { findCellsByStep } from '@Utils/markdownParser';

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
  const viewCells = props.getCurrentViewCells();

  // Render based on viewMode (matching original MainContent logic)
  if (props.viewMode === 'demo') {
    return (
      <DemoMode
        tasks={props.tasks}
        currentPhaseId={props.currentPhaseId || ''}
        currentStepIndex={props.currentStepIndex}
        cells={props.cells}
        findCellsByStep={findCellsByStep}
        renderCell={props.renderCell}
        readOnly={false}
        onPrevious={props.handlePreviousStep}
        onNext={props.handleNextStep}
        onPreviousPhase={props.handlePreviousPhase}
        onNextPhase={props.handleNextPhase}
        isFirstPhase={props.isFirstPhase}
        isLastPhase={props.isLastPhase}
      />
    );
  }

  if (props.viewMode === 'create') {
    return <CreateMode readOnly={false} />;
  }

  // Default: render cells with proper layout (for 'complete' mode and others)
  return (
    <div className="w-full h-full flex flex-col">
      {/* Render cells with proper padding and max width */}
      <div className="w-full max-w-screen-lg mx-auto px-8 lg:px-18 flex flex-col flex-1">
        <div className="h-16 w-full flex-shrink-0"></div>
        <div className="space-y-4">{viewCells.map((cell) => props.renderCell(cell))}</div>
        <div className="h-20 w-full flex-shrink-0"></div>
      </div>

      {/* Step navigation at bottom if in workflow mode */}
      {props.viewMode === 'complete' && props.renderStepNavigation()}
    </div>
  );
};
