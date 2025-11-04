import React, { useMemo } from 'react';
import { BsBoxArrowInRight, BsCheckCircleFill, BsGearFill, BsPlayCircleFill } from 'react-icons/bs';
import { usePipelineStore } from '../../Senario/Workflow/store/usePipelineStore';
import { useWorkflowStateMachine, WorkflowStep } from '../../Senario/Workflow/store/workflowStateMachine';
import { extractSectionTitle} from '../utils/String';
// A mapping for step status icons and colors
const STEP_STATUS_STYLES = {
  ACTIVE: {
    icon: <BsGearFill className="animate-spin text-theme-500" />,
    borderColor: 'border-theme-500',
    bgColor: 'bg-theme-50',
  },
  COMPLETED: {
    icon: <BsCheckCircleFill className="text-green-500" />,
    borderColor: 'border-green-500',
    bgColor: 'bg-green-50',
  },
  PENDING: {
    icon: <BsPlayCircleFill className="text-gray-400" />,
    borderColor: 'border-gray-300',
    bgColor: 'bg-white',
  },
};

/**
 * Renders a single step (action) within a stage card.
 * It determines its status (active, completed, pending) based on the FSM context.
 */
const StepItem: React.FC<{ step: WorkflowStep; stageIndex: number; stepIndex: number; fsmContext: any }> = ({
  step,
  stageIndex,
  stepIndex,
  fsmContext,
}) => {
  const status = useMemo(() => {
    const isCurrentStep = step.id === fsmContext.currentStepId;
    if (isCurrentStep) return 'ACTIVE';

    const currentStageIndex = fsmContext.currentStageIndex ?? 0;
    const currentStepIndex = fsmContext.currentStepIndex ?? 0;
    
    if (stageIndex < currentStageIndex || (stageIndex === currentStageIndex && stepIndex < currentStepIndex)) {
      return 'COMPLETED';
    }
    
    return 'PENDING';
  }, [step.id, stageIndex, stepIndex, fsmContext]);

  const styles = STEP_STATUS_STYLES[status];

  return (
    <div className={`p-3 rounded-lg border-l-4 transition-all ${styles.borderColor} ${styles.bgColor}`}>
      <div className="flex items-start gap-3">
        <div className="mt-1">{styles.icon}</div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800">{step.title || 'Untitled Step'}</p>
          {step.description && <p className="text-sm text-gray-600 mt-1">{step.description}</p>}
        </div>
      </div>
    </div>
  );
};

/**
 * Renders a card for a single stage of the workflow, including all its steps.
 */
const StageCard: React.FC<{ stage: any; stageIndex: number; fsmContext: any }> = ({ stage, stageIndex, fsmContext }) => {
  const isActive = stage.id === fsmContext.currentStageId;

  return (
    <div
      className={`p-4 rounded-xl border-2 transition-shadow duration-300 ${
        isActive ? 'border-theme-500 shadow-lg' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        {isActive ? (
          <BsBoxArrowInRight size={20} className="text-theme-600" />
        ) : (
          <span className="text-theme-600 font-bold text-lg">{stageIndex + 1}</span>
        )}
        <h3 className="text-lg font-bold text-gray-900">{extractSectionTitle(stage.title) || 'Untitled Stage'}</h3>
      </div>
      
      {stage.description && <p className="text-sm text-gray-600 mb-4">{stage.description}</p>}

      <div className="space-y-3">
        {stage.steps?.map((step: WorkflowStep, index: number) => (
          <StepItem key={step.id || index} step={step} stageIndex={stageIndex} stepIndex={index} fsmContext={fsmContext} />
        ))}
      </div>
    </div>
  );
};

/**
 * Main component to visualize the entire workflow plan and live progress.
 */
const WorkflowVisualization: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { workflowTemplate } = usePipelineStore();
  const { context: fsmContext } = useWorkflowStateMachine();

  // Augment FSM context with indices for easier status calculation
  const augmentedFsmContext = useMemo(() => {
    if (!workflowTemplate || !fsmContext.currentStageId) return fsmContext;
    
    const currentStageIndex = workflowTemplate.stages.findIndex(s => s.id === fsmContext.currentStageId);
    const currentStage = workflowTemplate.stages[currentStageIndex];
    const currentStepIndex = currentStage?.steps.findIndex(st => st.id === fsmContext.currentStepId);

    return { ...fsmContext, currentStageIndex, currentStepIndex };
  }, [workflowTemplate, fsmContext]);

  if (!workflowTemplate) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        No workflow has been loaded.
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <header className="pb-4 border-b">
        <h2 className="text-2xl font-extrabold text-gray-800">Workflow Plan</h2>
        <p className="text-md text-gray-600 mt-1">
          {workflowTemplate.name || 'A dynamically generated plan to achieve the objective.'}
        </p>
      </header>

      <div className="mb-4 mt-0">
        {workflowTemplate.stages.map((stage, index) => (
          <StageCard key={stage.id} stage={stage} stageIndex={index} fsmContext={augmentedFsmContext} />
        ))}
      </div>
    </div>
  );
};

export default WorkflowVisualization;