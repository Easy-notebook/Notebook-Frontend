/**
 * Workflow Panel Component
 * ========================
 *
 * Updated to use new state machine architecture
 * - Uses stateJSON for all state access
 * - Uses WorkflowEvent enum
 * - No more UPDATE_WORKFLOW events (removed from new architecture)
 */

import React, { useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import {
  useWorkflowStateMachine,
  WorkflowState,
} from '@/components/Scenario/Workflow/store/workflowStateMachine';
import { extractSectionTitle } from '@Notebook/utils/String';
import WorkflowErrorBoundary from './WorkflowErrorBoundary';

interface WorkflowNavigatorProps {
  stages: any[];
  currentStageId: string | null;
  currentStepId: string | null;
}

const WorkflowNavigator: React.FC<WorkflowNavigatorProps> = ({
  stages,
  currentStageId,
  currentStepId,
}) => {
  const currentStage = useMemo(
    () =>
      !stages || !Array.isArray(stages) || !currentStageId
        ? null
        : stages.find((s) => s.id === currentStageId),
    [stages, currentStageId]
  );
  const currentStageIndex = useMemo(
    () =>
      !stages || !Array.isArray(stages) || !currentStageId
        ? -1
        : stages.findIndex((s) => s.id === currentStageId),
    [stages, currentStageId]
  );
  const currentStepIndex = useMemo(
    () =>
      !currentStage?.steps || !Array.isArray(currentStage.steps) || !currentStepId
        ? -1
        : currentStage.steps.findIndex((st: any) => st.id === currentStepId),
    [currentStage, currentStepId]
  );

  if (!stages || !Array.isArray(stages) || !currentStage) return null;

  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b">
      <div className="px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-800">
          {currentStage.title || `Stage ${currentStageIndex + 1}`}
          <span className="ml-3 font-normal text-gray-500">
            Step {currentStepIndex + 1} of {currentStage.steps.length}
          </span>
        </h2>
      </div>
      <div className="overflow-x-auto whitespace-nowrap">
        <div className="flex border-t">
          {currentStage.steps.map((step: any, index: number) => {
            const isCompleted = index < currentStepIndex;
            const isActive = index === currentStepIndex;
            return (
              <div
                key={step.id}
                className={`flex items-center py-3 px-4 border-b-2 transition-colors ${isActive ? 'border-theme-500 text-theme-600 bg-theme-50' : 'border-transparent text-gray-600'}`}
                title={extractSectionTitle(step.title ?? '')}
              >
                <div
                  className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full mr-2 text-xs font-semibold ${isActive ? 'bg-theme-100 text-theme-600' : isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-700'}`}
                >
                  {isCompleted ? <CheckCircle size={14} /> : <span>{index + 1}</span>}
                </div>
                <span className="text-sm font-medium">
                  {extractSectionTitle(step.title || step.id || '')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const WorkflowPanel: React.FC = () => {
  const { stateJSON, currentState } = useWorkflowStateMachine(); // ✅ Use stateJSON as single source of truth

  // ✅ Get current location from stateJSON
  const currentLocation = stateJSON.observation?.location?.current;
  const currentStageId = currentLocation?.stage_id;
  const currentStepId = currentLocation?.step_id;

  // ✅ Get stages from stateJSON.observation.location.progress.stages.planned (memoized)
  const plannedStages = useMemo(
    () => stateJSON.observation?.location?.progress?.stages?.planned || [],
    [stateJSON.observation?.location?.progress?.stages?.planned]
  );
  const plannedSteps = useMemo(
    () => stateJSON.observation?.location?.progress?.steps?.planned || [],
    [stateJSON.observation?.location?.progress?.steps?.planned]
  );

  const navigatorData = useMemo(() => {
    if (
      !plannedStages ||
      !Array.isArray(plannedStages) ||
      plannedStages.length === 0 ||
      !currentStageId ||
      !currentStepId
    )
      return null;

    // ✅ Convert stateJSON format to expected format
    // In new architecture, steps are stored separately, need to map them to stages
    const stagesWithSteps = plannedStages.map((stage: any) => ({
      id: stage.stage_id,
      title: stage.title,
      steps: plannedSteps.map((step: any) => ({
        id: step.step_id,
        title: step.title,
      })),
    }));

    return {
      stages: stagesWithSteps,
      currentStageId,
      currentStepId,
    };
  }, [plannedStages, plannedSteps, currentStageId, currentStepId]);

  // Hide panel if workflow is complete
  if (currentState === WorkflowState.COMPLETE) {
    return null;
  }

  return (
    <WorkflowErrorBoundary>
      {navigatorData && (
        <WorkflowNavigator
          stages={navigatorData.stages}
          currentStageId={navigatorData.currentStageId}
          currentStepId={navigatorData.currentStepId}
        />
      )}
    </WorkflowErrorBoundary>
  );
};

export default WorkflowPanel;
