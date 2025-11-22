import React, { useMemo } from 'react';
import { CheckCircle, Circle, PlayCircle, Clock } from 'lucide-react';
import { useWorkflowStateMachine } from '@/components/Scenario/Workflow/store/workflowStateMachine';
import { usePipelineStore } from '@/components/Scenario/Workflow/store/usePipelineStore';

interface WorkflowVisualizationProps {
  className?: string;
}

const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({ className = '' }) => {
  const { workflowTemplate } = usePipelineStore();
  const { stateJSON } = useWorkflowStateMachine();

  // Get current location from stateJSON
  const currentLocation = stateJSON.observation?.location?.current;
  const currentStageId = currentLocation?.stage_id;
  const currentStepId = currentLocation?.step_id;

  // Compute stage status
  const stagesWithStatus = useMemo(() => {
    if (!workflowTemplate?.stages || !Array.isArray(workflowTemplate.stages)) {
      return [];
    }

    return workflowTemplate.stages.map((stage: any) => {
      const isCurrentStage = stage.id === currentStageId;
      const currentStageIndex = workflowTemplate.stages.findIndex(
        (s: any) => s.id === currentStageId
      );
      const stageIndex = workflowTemplate.stages.findIndex((s: any) => s.id === stage.id);

      let status: 'pending' | 'active' | 'completed' = 'pending';
      if (stageIndex < currentStageIndex) {
        status = 'completed';
      } else if (isCurrentStage) {
        status = 'active';
      }

      // Compute step status within this stage
      const stepsWithStatus =
        stage.steps?.map((step: any, stepIndex: number) => {
          const isCurrentStep = isCurrentStage && step.id === currentStepId;
          const currentStepIndex = stage.steps.findIndex((s: any) => s.id === currentStepId);

          let stepStatus: 'pending' | 'active' | 'completed' = 'pending';
          if (isCurrentStage) {
            if (stepIndex < currentStepIndex) {
              stepStatus = 'completed';
            } else if (isCurrentStep) {
              stepStatus = 'active';
            }
          } else if (status === 'completed') {
            stepStatus = 'completed';
          }

          return {
            ...step,
            status: stepStatus,
          };
        }) || [];

      return {
        ...stage,
        status,
        steps: stepsWithStatus,
      };
    });
  }, [workflowTemplate, currentStageId, currentStepId]);

  if (!stagesWithStatus || stagesWithStatus.length === 0) {
    return null;
  }

  return (
    <div className={`workflow-visualization ${className}`}>
      <div className="space-y-4">
        {stagesWithStatus.map((stage: any, stageIndex: number) => (
          <div key={stage.id} className="relative">
            {/* Stage Header */}
            <div
              className={`flex items-center gap-3 p-4 rounded-lg transition-all ${
                stage.status === 'active'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                  : stage.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700'
                    : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {stage.status === 'completed' ? (
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                ) : stage.status === 'active' ? (
                  <PlayCircle className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
                ) : (
                  <Clock className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                )}
              </div>

              {/* Stage Info */}
              <div className="flex-1">
                <h3
                  className={`text-lg font-semibold ${
                    stage.status === 'active'
                      ? 'text-blue-900 dark:text-blue-100'
                      : stage.status === 'completed'
                        ? 'text-green-900 dark:text-green-100'
                        : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {stage.title || `Stage ${stageIndex + 1}`}
                </h3>
                {stage.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {stage.description}
                  </p>
                )}
              </div>

              {/* Progress Badge */}
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  stage.status === 'active'
                    ? 'bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100'
                    : stage.status === 'completed'
                      ? 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {stage.status === 'completed'
                  ? 'Completed'
                  : stage.status === 'active'
                    ? 'In Progress'
                    : 'Pending'}
              </div>
            </div>

            {/* Steps */}
            {stage.steps && stage.steps.length > 0 && (
              <div className="ml-12 mt-2 space-y-2">
                {stage.steps.map((step: any, stepIndex: number) => (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-md transition-all ${
                      step.status === 'active'
                        ? 'bg-blue-50 dark:bg-blue-900/10 border border-blue-300 dark:border-blue-700'
                        : step.status === 'completed'
                          ? 'bg-green-50 dark:bg-green-900/10'
                          : 'bg-transparent'
                    }`}
                  >
                    {/* Step Icon */}
                    <div className="flex-shrink-0">
                      {step.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : step.status === 'active' ? (
                        <Circle className="w-4 h-4 text-blue-600 dark:text-blue-400 fill-blue-600 dark:fill-blue-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                      )}
                    </div>

                    {/* Step Info */}
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          step.status === 'active'
                            ? 'text-blue-900 dark:text-blue-100'
                            : step.status === 'completed'
                              ? 'text-green-900 dark:text-green-100'
                              : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {stepIndex + 1}. {step.title || step.id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Connector Line to Next Stage */}
            {stageIndex < stagesWithStatus.length - 1 && (
              <div className="ml-6 h-4 w-0.5 bg-gray-200 dark:bg-gray-700" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkflowVisualization;
