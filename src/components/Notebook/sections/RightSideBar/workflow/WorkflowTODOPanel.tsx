// moved to sections/RightSideBar/workflow
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useCallback } from 'react';
import { useWorkflowStateMachine } from '@/components/Scenario/Workflow/store/workflowStateMachine';
import { extractSectionTitle } from '../../../utils/String';
import { CheckCircle, Circle, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { filterSectionStageText } from '../../../utils/String';

const WorkflowTODOPanel = () => {
  const { t } = useTranslation();
  const { stateJSON } = useWorkflowStateMachine(); // ✅ Use stateJSON as single source of truth

  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  // ✅ Get all data from stateJSON (new architecture)
  const currentLocation = stateJSON.observation?.location?.current;
  const currentStageId = currentLocation?.stage_id;
  const currentStepId = currentLocation?.step_id;

  // ✅ Get stages from stateJSON.observation.location.progress.stages.planned (memoized)
  const plannedStages = useMemo(
    () => stateJSON.observation?.location?.progress?.stages?.planned || [],
    [stateJSON.observation?.location?.progress?.stages?.planned]
  );

  // 使用 useMemo 预计算当前阶段和步骤的索引，以优化和简化渲染逻辑
  const executionIndices = useMemo(() => {
    if (!plannedStages.length || !currentStageId) {
      return { stageIndex: -1, stepIndex: -1 };
    }
    const stageIndex = plannedStages.findIndex((s: any) => s.stage_id === currentStageId);
    if (stageIndex === -1) {
      return { stageIndex: -1, stepIndex: -1 };
    }
    // Steps are stored in stateJSON.observation.location.progress.steps.planned
    const plannedSteps = stateJSON.observation?.location?.progress?.steps?.planned || [];
    const stepIndex = plannedSteps.findIndex((st: any) => st.step_id === currentStepId);
    return { stageIndex, stepIndex };
  }, [
    plannedStages,
    stateJSON.observation?.location?.progress?.steps?.planned,
    currentStageId,
    currentStepId,
  ]);

  const toggleStage = useCallback((stageId: string) => {
    setExpandedStages((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  }, []);

  const renderStageStep = (step: any, currentStageIndex: number, stepIndex: number) => {
    const stepId = step.step_id || step.id; // ✅ Use step_id from stateJSON
    const isCurrent =
      executionIndices.stageIndex === currentStageIndex && executionIndices.stepIndex === stepIndex;
    const isCompleted =
      executionIndices.stageIndex > currentStageIndex ||
      (executionIndices.stageIndex === currentStageIndex && executionIndices.stepIndex > stepIndex);

    return (
      <div key={stepId} className="ml-6 py-1 flex items-start gap-2 text-sm">
        <div className="flex-shrink-0 mt-1">
          {isCompleted ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : isCurrent ? (
            <div className="w-4 h-4 rounded-full border-2 border-theme-600 animate-pulse" />
          ) : (
            <Circle className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <div className="flex-1">
          <div
            className={`font-medium break-words ${
              isCurrent
                ? 'text-theme-700'
                : isCompleted
                  ? 'text-green-700 line-through'
                  : 'text-gray-600'
            }`}
          >
            {filterSectionStageText(step.title || extractSectionTitle(step.step_id || step.id))}
          </div>
        </div>
      </div>
    );
  };

  const renderStage = (stage: any, index: number) => {
    const isCurrent = executionIndices.stageIndex === index;
    const isCompleted = executionIndices.stageIndex > index;
    const stageId = stage.stage_id || stage.id; // ✅ Use stage_id from stateJSON
    const isExpanded = expandedStages[stageId] || isCurrent;

    // ✅ Get steps for this stage from stateJSON.observation.location.progress.steps.planned
    // Note: In the new architecture, steps are stored separately, not nested in stages
    const allPlannedSteps = stateJSON.observation?.location?.progress?.steps?.planned || [];
    const stageSteps = allPlannedSteps; // For now, show all steps (can filter by stage_id if needed)
    const hasSteps = stageSteps && stageSteps.length > 0;

    return (
      <div key={stageId} className="mb-3">
        <div
          className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
            isCurrent
              ? 'ring-2 ring-theme-300 dark:ring-theme-700'
              : isCompleted
                ? 'ring-1 ring-green-300 dark:ring-green-700'
                : 'ring-1 ring-gray-300 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-600'
          }`}
          onClick={() => hasSteps && toggleStage(stageId)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <div
                className={`font-semibold text-sm break-words ${
                  isCurrent ? 'text-theme-800' : isCompleted ? 'text-green-800' : 'text-gray-700'
                }`}
              >
                {extractSectionTitle(stage.title || stage.stage_id || stage.id)}
              </div>
              {isCurrent && (
                <span className="text-xs px-2 py-0.5 ring-1 ring-theme-400 dark:ring-theme-600 text-theme-800 dark:text-theme-300 rounded-full font-medium">
                  {t('rightSideBar.currentStage')}
                </span>
              )}
              {isCompleted && (
                <span className="text-xs px-2 py-0.5 ring-1 ring-green-400 dark:ring-green-600 text-green-800 dark:text-green-300 rounded-full font-medium">
                  {t('rightSideBar.completed')}
                </span>
              )}
            </div>
          </div>
          {hasSteps && (
            <div className="flex-shrink-0">
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </div>
          )}
        </div>

        {hasSteps && isExpanded && (
          <div className="mt-2 space-y-1">
            {stageSteps.map((step: any, stepIndex: number) =>
              renderStageStep(step, index, stepIndex)
            )}
          </div>
        )}
      </div>
    );
  };

  // ✅ Check if we have planned stages from stateJSON
  if (!plannedStages || plannedStages.length === 0) {
    // return <div className="p-4 text-center text-gray-500">{t('rightSideBar.noWorkflowPlan')}</div>;
    return null;
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
          <ArrowRight className="w-4 h-4" />
          {t('rightSideBar.workflowStages')}
        </h4>
        {plannedStages.map((stage: any, index: number) => renderStage(stage, index))}
      </div>
    </div>
  );
};

export default WorkflowTODOPanel;
