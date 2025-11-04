import React, { useMemo } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

// Primary state stores for the component
import { useWorkflowPanelStore } from '../store/workflowPanelStore';
import { useWorkflowStateMachine, EVENTS } from '../../Senario/Workflow/store/workflowStateMachine';
import { usePipelineStore } from '../../Senario/Workflow/store/usePipelineStore';
import { extractSectionTitle} from '../utils/String';
import WorkflowErrorBoundary from './WorkflowErrorBoundary';

// ----------------------
// Type Definitions
// ----------------------
import { WorkflowStage, WorkflowTemplate } from '../../Senario/Workflow/store/workflowStateMachine';

type Stage = WorkflowStage;
interface PendingWorkflowUpdate { workflowTemplate?: WorkflowTemplate };
interface UpdateConfirmationDialogProps {
  onConfirm: () => void;
  onReject: () => void;
  pendingUpdate: PendingWorkflowUpdate | null;
}
interface WorkflowNavigatorProps {
  stages: Stage[];
  currentStageId: string | null;
  currentStepId: string | null;
}
/**
 * Sub-component: Renders the confirmation dialog for workflow updates.
 * It's a pure component that receives data and callbacks.
 */
const UpdateConfirmationDialog: React.FC<UpdateConfirmationDialogProps> = ({ onConfirm, onReject, pendingUpdate }) => {
  if (!pendingUpdate?.workflowTemplate) {
    return null;
  }

  const { stages: newStages } = pendingUpdate.workflowTemplate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" aria-modal="true">
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-theme-500" />
            <h3 className="text-lg font-semibold text-gray-900">
            The PCS agent suggests updating the TODO
            </h3>
          </div>
          <button onClick={onReject} className="p-1 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* <p className="text-gray-600 mb-4">
            The AI agent suggests updating the plan to better match your goal.
          </p> */}
          <div className="bg-gray-50 border rounded-lg p-4 max-h-60 overflow-y-auto">
            {/* <h4 className="font-semibold text-gray-800 mb-3">{newWorkflowName || 'New Plan'}</h4> */}
            <ul className="space-y-2">
              {newStages?.map((stage, index) => (
                <li key={stage.id || index} className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-theme-100 text-theme-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-700">
                    {stage.title || stage.id.replace(/^chapter_\d+_/, '').replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-4 p-6 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onReject}
            className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
          >
            Reject
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 text-sm font-medium text-white bg-theme-600 rounded-lg hover:bg-theme-700 transition-all focus:outline-none focus:ring-2 focus:ring-theme-500 focus:ring-offset-2"
          >
            Accept Update
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Sub-component: Renders the step navigation bar.
 * It purely reflects the state from the FSM and pipeline.
 */
const WorkflowNavigator: React.FC<WorkflowNavigatorProps> = ({ stages, currentStageId, currentStepId }) => {
  const currentStage = useMemo(() => {
    if (!stages || !Array.isArray(stages) || !currentStageId) return null;
    return stages.find(s => s.id === currentStageId);
  }, [stages, currentStageId]);

  const currentStageIndex = useMemo(() => {
    if (!stages || !Array.isArray(stages) || !currentStageId) return -1;
    return stages.findIndex(s => s.id === currentStageId);
  }, [stages, currentStageId]);

  const currentStepIndex = useMemo(() => {
    if (!currentStage?.steps || !Array.isArray(currentStage.steps) || !currentStepId) return -1;
    return currentStage.steps.findIndex(st => st.id === currentStepId);
  }, [currentStage, currentStepId]);

  // 防护：如果没有有效的stages或currentStage，不渲染
  if (!stages || !Array.isArray(stages) || !currentStage) return null;

  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b">
      {/* Stage Header */}
      <div className="px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-800">
          {currentStage.title || `Stage ${currentStageIndex + 1}`}
          <span className="ml-3 font-normal text-gray-500">
            Step {currentStepIndex + 1} of {currentStage.steps.length}
          </span>
        </h2>
      </div>

      {/* Steps List */}
      <div className="overflow-x-auto whitespace-nowrap">
        <div className="flex border-t">
          {currentStage.steps.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isActive = index === currentStepIndex;

            return (
              <div
                key={step.id}
                className={`flex items-center py-3 px-4 border-b-2 transition-colors ${
                  isActive ? 'border-theme-500 text-theme-600 bg-theme-50' : 'border-transparent text-gray-600'
                }`}
                title={extractSectionTitle(step.title ?? '')}
              >
                <div
                  className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full mr-2 text-xs font-semibold ${
                    isActive ? 'bg-theme-100 text-theme-600' : isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {isCompleted ? <CheckCircle size={14} /> : <span>{index + 1}</span>}
                </div>
                <span className="text-sm font-medium">{extractSectionTitle(step.title || step.id || '')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Main Component: Connects stores to the UI sub-components.
 */
const WorkflowPanel: React.FC = () => {
  // Get UI state from the panel store
  const { showWorkflowConfirm, pendingWorkflowUpdate } = useWorkflowPanelStore();
  
  // Get workflow structure from the pipeline store
  const { workflowTemplate } = usePipelineStore();
  
  // Get execution context from the state machine
  const { context: fsmContext, transition } = useWorkflowStateMachine();

  // Callbacks to dispatch events to the state machine
  const handleConfirm = () => {
    // Only trigger state machine event - let state machine handle all business logic
    transition(EVENTS.UPDATE_WORKFLOW_CONFIRMED);
  };
  const handleReject = () => {
    // Only trigger state machine event - let state machine handle all cleanup
    transition(EVENTS.UPDATE_WORKFLOW_REJECTED);
  };

  // Memoize derived data to prevent unnecessary re-renders
  const navigatorData = useMemo(() => {
    // 增强的空值检查
    if (!workflowTemplate?.stages ||
        !Array.isArray(workflowTemplate.stages) ||
        workflowTemplate.stages.length === 0 ||
        !fsmContext.currentStageId ||
        !fsmContext.currentStepId) {
      return null;
    }

    return {
      stages: workflowTemplate.stages,
      currentStageId: fsmContext.currentStageId,
      currentStepId: fsmContext.currentStepId,
    };
  }, [workflowTemplate, fsmContext]);

  return (
    <WorkflowErrorBoundary>
      {/* Render the confirmation dialog when needed */}
      {showWorkflowConfirm && (
        <UpdateConfirmationDialog
          onConfirm={handleConfirm}
          onReject={handleReject}
          pendingUpdate={pendingWorkflowUpdate}
        />
      )}

      {/* Render the navigator if data is available */}
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