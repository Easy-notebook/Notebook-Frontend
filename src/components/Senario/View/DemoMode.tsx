import React from 'react';
import StepNavigation from '../../Notebook/MainContainer/StepNavigation';
import { useSettings } from '../../../store/settingsStore';

interface DemoModeProps {
  className?: string;
  readOnly?: boolean;
  tasks?: any[];
  currentPhaseId?: string;
  currentStepIndex?: number;
  cells?: any[];
  findCellsByStep?: (tasks: any[], phaseId: string, stepId: string, cells: any[]) => any[];
  renderCell?: (cell: any) => React.ReactNode;
  // Navigation handlers for StepNavigation
  onPrevious?: () => void;
  onNext?: () => void;
  onPreviousPhase?: () => void;
  onNextPhase?: () => void;
  isFirstPhase?: boolean;
  isLastPhase?: boolean;
}

/**
 * DemoMode component combines StepMode's cell filtering and layout logic
 * with CreateMode's dual editor support (tiptap and jupyter editors).
 * It provides a demonstration mode with step-by-step navigation and proper cell filtering.
 */
const DemoMode: React.FC<DemoModeProps> = ({ 
  tasks = [],
  currentPhaseId,
  currentStepIndex = 0,
  cells = [],
  findCellsByStep,
  renderCell,
  onPrevious,
  onNext,
  onPreviousPhase,
  onNextPhase,
  isFirstPhase = false,
  isLastPhase = false
}) => {
  const settings = useSettings();
  
  // Determine which editor to render based on the current settings.
  const editorType = settings.editorSettings?.editorType || 'tiptap';

  // If no phase is selected, show editor selection interface
  if (!currentPhaseId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="mb-6 p-6 bg-gradient-to-r from-theme-50 to-green-50 rounded-xl border border-theme-200">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Demo Mode</h3>
            <p className="text-gray-600">
              Interactive demonstration mode with {editorType === 'tiptap' ? 'Tiptap' : 'Jupyter'} editor support
            </p>
          </div>
          <p className="text-gray-500">Please select a phase to begin demonstration</p>
        </div>
      </div>
    );
  }

  // Find the current phase and step (similar to StepMode logic)
  type StepRef = { id: string };
  type PhaseRef = { id: string; steps: StepRef[] };
  type TaskRef = { phases: PhaseRef[] };
  const typedTasks: TaskRef[] = Array.isArray(tasks) ? (tasks as unknown as TaskRef[]) : [];
  const phase = typedTasks
    .find((task: TaskRef) => Array.isArray(task?.phases) && task.phases.some((p: PhaseRef) => p.id === (currentPhaseId || '')))
    ?.phases.find((p: PhaseRef) => p.id === (currentPhaseId || ''));

  if (!phase) {
    console.warn(`Phase with id "${currentPhaseId}" not found.`);
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Selected phase not found</p>
      </div>
    );
  }

  const currentStep = phase.steps[currentStepIndex];
  if (!currentStep) {
    console.warn(`Step with index "${currentStepIndex}" not found in phase "${currentPhaseId}".`);
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Step not found</p>
      </div>
    );
  }

  // Use the same cell filtering logic as StepMode
  const stepCells = findCellsByStep ? findCellsByStep(tasks, currentPhaseId, currentStep.id, cells) : [];

  return (
    <div className="min-h-full flex flex-col relative">
      <div className="flex-1 p-12">
        <div className="relative space-y-6 max-w-screen-xl mx-auto min-h-[calc(100vh-12rem)]">
          {/* Step Content Display (using StepMode's cell filtering logic) */}
          {stepCells.length > 0 && (
            <div>
              <div className="space-y-4">
                {stepCells.map((cell) => (
                  <div
                    key={cell.id}
                    id={`cell-${cell.id}`}
                    className="relative w-full transition-all duration-300"
                  >
                    {renderCell ? renderCell(cell) : (
                      <div className="p-4 text-gray-500">
                        Cell content not available
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no step cells */}
          {stepCells.length === 0 && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 shadow-sm p-12 text-center min-h-[50vh] flex flex-col justify-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 mb-2">No content available for this step</p>
              <p className="text-gray-400 text-sm">Use the interactive editor above to create content</p>
            </div>
          )}

        </div>
      </div>
      
      {/* Step Navigation - Fixed at bottom of container */}
      {currentPhaseId && onPrevious && onNext && phase && (
        <div className="sticky bottom-0 left-0 right-0 z-10 mt-auto">
          <StepNavigation
            currentPhase={{ id: phase.id, title: (phase as any).title ?? phase.id }}
            currentStepIndex={currentStepIndex}
            totalSteps={phase.steps.length}
            onPrevious={onPrevious}
            onNext={onNext}
            onPreviousPhase={onPreviousPhase || (() => {})}
            onNextPhase={onNextPhase || (() => {})}
            isFirstPhase={isFirstPhase}
            isLastPhase={isLastPhase}
          />
        </div>
      )}
    </div>
  );
};

DemoMode.displayName = 'DemoMode';

export default DemoMode;