import React, { useMemo } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useWorkflowPanelStore } from '@Notebook/store/workflowPanelStore';
import {
  useWorkflowStateMachine,
  EVENTS,
  WorkflowStage,
  WorkflowTemplate,
} from '@/components/Scenario/Workflow/store/workflowStateMachine';
import { usePipelineStore } from '@/components/Scenario/Workflow/store/usePipelineStore';
import { extractSectionTitle } from '@Notebook/utils/String';
import WorkflowErrorBoundary from './WorkflowErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/UI/card';

type Stage = WorkflowStage;
interface PendingWorkflowUpdate {
  workflowTemplate?: WorkflowTemplate;
}
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

const UpdateConfirmationDialog: React.FC<UpdateConfirmationDialogProps> = ({
  onConfirm,
  onReject,
  pendingUpdate,
}) => {
  if (!pendingUpdate?.workflowTemplate) return null;
  const { stages: newStages } = pendingUpdate.workflowTemplate;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      aria-modal="true"
    >
      <Card className="relative w-full max-w-lg m-4">
        <CardHeader className="flex flex-row items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-theme-500" />
            <CardTitle className="text-lg font-semibold text-gray-900">
              The PCS agent suggests updating the TODO
            </CardTitle>
          </div>
          <button
            onClick={onReject}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </CardHeader>
        <CardContent className="p-6">
          <div className="bg-gray-50 border rounded-lg p-4 max-h-60 overflow-y-auto">
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
        </CardContent>
        <CardFooter className="flex justify-end gap-4 p-6 bg-gray-50">
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
        </CardFooter>
      </Card>
    </div>
  );
};

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
        : currentStage.steps.findIndex((st) => st.id === currentStepId),
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
          {currentStage.steps.map((step, index) => {
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
  const { showWorkflowConfirm, pendingWorkflowUpdate } = useWorkflowPanelStore();
  const { workflowTemplate } = usePipelineStore();
  const { context: fsmContext, transition } = useWorkflowStateMachine();

  const handleConfirm = () => transition(EVENTS.UPDATE_WORKFLOW_CONFIRMED);
  const handleReject = () => transition(EVENTS.UPDATE_WORKFLOW_REJECTED);

  const navigatorData = useMemo(() => {
    if (
      !workflowTemplate?.stages ||
      !Array.isArray(workflowTemplate.stages) ||
      workflowTemplate.stages.length === 0 ||
      !fsmContext.currentStageId ||
      !fsmContext.currentStepId
    )
      return null;
    return {
      stages: workflowTemplate.stages,
      currentStageId: fsmContext.currentStageId,
      currentStepId: fsmContext.currentStepId,
    };
  }, [workflowTemplate, fsmContext]);

  return (
    <WorkflowErrorBoundary>
      {showWorkflowConfirm && (
        <UpdateConfirmationDialog
          onConfirm={handleConfirm}
          onReject={handleReject}
          pendingUpdate={pendingWorkflowUpdate}
        />
      )}
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
