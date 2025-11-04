import { useTranslation } from 'react-i18next';
import { useMemo, useState, useCallback } from 'react';
import { usePipelineStore } from '../../Senario/Workflow/store/usePipelineStore'; 
import { useWorkflowStateMachine } from '../../Senario/Workflow/store/workflowStateMachine';
import { extractSectionTitle } from '../utils/String';
import {
    CheckCircle, Circle, ChevronDown, ChevronUp, ArrowRight
  } from 'lucide-react';
import { filterSectionStageText } from '../utils/String';


const WorkflowTODOPanel = () => {
    const { t } = useTranslation();
    const { workflowTemplate } = usePipelineStore();
    const { context: fsmContext } = useWorkflowStateMachine(); // 使用 FSM context 作为状态来源
  
    const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  
    // 使用 useMemo 预计算当前阶段和步骤的索引，以优化和简化渲染逻辑
    const executionIndices = useMemo(() => {
      if (!workflowTemplate || !fsmContext.currentStageId) {
        return { stageIndex: -1, stepIndex: -1 };
      }
      const stageIndex = workflowTemplate.stages.findIndex(s => s.id === fsmContext.currentStageId);
      if (stageIndex === -1) {
        return { stageIndex: -1, stepIndex: -1 };
      }
      const stepIndex = workflowTemplate.stages[stageIndex]?.steps.findIndex(st => st.id === fsmContext.currentStepId) ?? -1;
      return { stageIndex, stepIndex };
    }, [workflowTemplate, fsmContext]);
  
    const toggleStage = useCallback((stageId: string) => {
      setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
    }, []);
  
    const renderStageStep = (step: any, currentStageIndex: number, stepIndex: number) => {
      const stepId = step.id; // 统一使用 id
      const isCurrent = executionIndices.stageIndex === currentStageIndex && executionIndices.stepIndex === stepIndex;
      const isCompleted = executionIndices.stageIndex > currentStageIndex || 
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
          <div className="flex-1 min-w-0">
            <div className={`font-medium break-words ${
              isCurrent ? 'text-theme-700' : 
              isCompleted ? 'text-green-700 line-through' : 'text-gray-600'
            }`}>
              {filterSectionStageText(step.title || extractSectionTitle(step.id))}
            </div>
          </div>
        </div>
      );
    };
  
    const renderStage = (stage: any, index: number) => {
      const isCurrent = executionIndices.stageIndex === index;
      const isCompleted = executionIndices.stageIndex > index;
      const isExpanded = expandedStages[stage.id] || isCurrent;
      const hasSteps = stage.steps && stage.steps.length > 0;
  
      return (
        <div key={stage.id} className="mb-3">
          <div 
            className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
              isCurrent ? 'bg-theme-100 ring-1 ring-theme-200' :
              isCompleted ? 'bg-green-50 hover:bg-green-100' : 
              'bg-gray-50 hover:bg-gray-100'
            }`}
            onClick={() => hasSteps && toggleStage(stage.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <div className={`font-semibold text-sm break-words ${
                  isCurrent ? 'text-theme-800' : 
                  isCompleted ? 'text-green-800' : 'text-gray-700'
                }`}>
                  {extractSectionTitle(stage.title || stage.id)}
                </div>
                {isCurrent && (
                  <span className="text-xs px-2 py-0.5 bg-theme-200 text-theme-800 rounded-full font-medium">
                    {t('rightSideBar.currentStage')}
                  </span>
                )}
                 {isCompleted && (
                  <span className="text-xs px-2 py-0.5 bg-green-200 text-green-800 rounded-full font-medium">
                    {t('rightSideBar.completed')}
                  </span>
                )}
              </div>
            </div>
            {hasSteps && (
              <div className="flex-shrink-0">
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            )}
          </div>
          
          {hasSteps && isExpanded && (
            <div className="mt-2 space-y-1">
              {stage.steps.map((step: any, stepIndex: number) => renderStageStep(step, index, stepIndex))}
            </div>
          )}
        </div>
      );
    };
  
    if (!workflowTemplate?.stages) {
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
          {workflowTemplate.stages.map((stage, index) => renderStage(stage, index))}
        </div>
      </div>
    );
  };

export default WorkflowTODOPanel;