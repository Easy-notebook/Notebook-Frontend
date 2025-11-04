import { useCallback, useEffect } from 'react';
import { usePipelineStore } from '@Senario/Workflow/store/pipelineController';
import { useWorkflowStateMachine } from '../../Senario/Workflow/store/workflowStateMachine';
import { useWorkflowPanelStore } from '../store/workflowPanelStore';

/**
 * This centralizes workflow confirmation, navigation, and state management
 */
export const useWorkflowManager = (
  stageId: string,
  stepsLoaded: number[],
  isCompleted: boolean,
  currentSteps: any[]
) => {
  const {
    setShowWorkflowConfirm,
    setPendingWorkflowUpdate,
    setWorkflowUpdated,
    incrementWorkflowUpdateCount,
    setCurrentSteps,
    setStepsLoaded,
    setIsCompleted: setPanelIsCompleted,
    setOnConfirmWorkflowUpdate,
    setOnRejectWorkflowUpdate,
    setOnNavigateToStep
  } = useWorkflowPanelStore();

  // Handle workflow update confirmation
  const handleConfirmWorkflowUpdate = useCallback(() => {
    const { pendingWorkflowUpdate, pendingStepCompletion } = useWorkflowPanelStore.getState();
    const { confirmWorkflowUpdate, pendingWorkflowUpdate: fsmPending } = useWorkflowStateMachine.getState();
    
    if (!pendingWorkflowUpdate) {
      console.warn('[useWorkflowManager] No pending workflow update found when confirming.');
      return;
    }

    // Prefer letting the FSM handle the update to keep state in sync across stores
    if (fsmPending || confirmWorkflowUpdate) {
      console.log('[useWorkflowManager] Delegating workflow update confirmation to FSM');
      confirmWorkflowUpdate();
    } else {
      console.error('[useWorkflowManager] FSM confirmWorkflowUpdate method not found.');
    }

    // Handle any pending step completion that was queued while awaiting confirmation
    if (pendingStepCompletion) {
      try {
        if (pendingStepCompletion.markStepCompleted) pendingStepCompletion.markStepCompleted();
        if (pendingStepCompletion.completeStep) pendingStepCompletion.completeStep();
      } catch (error) {
        console.error('[useWorkflowManager] Error executing pending step completion:', error);
      }
      setPendingStepCompletion(null);
    }

    setWorkflowUpdated(true);
    incrementWorkflowUpdateCount();
    setShowWorkflowConfirm(false);
    setPendingWorkflowUpdate(null);
  }
  }, [
    setWorkflowUpdated, 
    incrementWorkflowUpdateCount, 
    setShowWorkflowConfirm, 
    setPendingWorkflowUpdate, 
    setPendingStepCompletion
  ]);

  const handleRejectWorkflowUpdate = useCallback(() => {
    console.log('Workflow update rejected by user');
    setShowWorkflowConfirm(false);
    setPendingWorkflowUpdate(null);
  }, [setShowWorkflowConfirm, setPendingWorkflowUpdate]);

  // Handle workflow update processing
  const processWorkflowUpdate = useCallback((workflow: any) => {
    console.log('=== WORKFLOW UPDATE RECEIVED ===');
    console.log('Raw workflow data:', JSON.stringify(workflow, null, 2));
    
    // Validate workflow structure
    if (!workflow) {
      console.error('Workflow is null or undefined:', workflow);
      return false;
    }
    
    if (!workflow.stages) {
      console.error('Workflow has no stages property:', workflow);
      return false;
    }
    
    if (!Array.isArray(workflow.stages)) {
      console.error('Workflow stages is not an array:', workflow.stages);
      return false;
    }
    
    console.log(`Workflow validation passed: ${workflow.stages.length} stages found`);
    
    // Store pending update and show confirmation
    setPendingWorkflowUpdate(workflow);
    setShowWorkflowConfirm(true);
    
    return true;
  }, [setPendingWorkflowUpdate, setShowWorkflowConfirm]);

  // Handle stage steps update
  const processStageStepsUpdate = useCallback((
    updateStageId: string,
    updatedSteps: any[],
    nextStepId?: string,
    onNavigateCallback?: (stepIndex: number, stepId: string) => void
  ) => {
    console.log('=== STAGE STEPS UPDATE RECEIVED ===');
    console.log('Stage update data:', { updateStageId, updatedSteps, nextStepId });
    
    if (updateStageId === stageId) {
      console.log(`Updating steps for current stage: ${updateStageId}`);
      
      // Update current workflow template with new steps for this stage
      const currentState = usePipelineStore.getState();
      const currentWorkflow = currentState.workflowTemplate;
      
      if (currentWorkflow && currentWorkflow.stages) {
        const updatedWorkflow = {
          ...currentWorkflow,
          stages: currentWorkflow.stages.map(stage => 
            stage.id === updateStageId 
              ? { ...stage, steps: updatedSteps }
              : stage
          )
        };
        
        // Update pipeline store
        usePipelineStore.setState({
          workflowTemplate: updatedWorkflow
        });
        
        console.log('Stage steps updated successfully');
        
        // Auto-navigate to first selected step if provided
        if (nextStepId && onNavigateCallback) {
          console.log(`Auto-navigating to first step: ${nextStepId}`);
          setTimeout(() => {
            // Find the step index
            const stepIndex = updatedSteps.findIndex(step => step.step_id === nextStepId);
            if (stepIndex >= 0) {
              onNavigateCallback(stepIndex, nextStepId);
              console.log(`Successfully navigated to step ${stepIndex}: ${nextStepId}`);
            }
          }, 100);
        }
      }
    } else {
      console.log(`Stage steps update for different stage: ${updateStageId}, current: ${stageId}`);
    }
  }, [stageId]);

  // Auto-hide workflow update notification after 5 seconds
  useEffect(() => {
    const { workflowUpdated } = useWorkflowPanelStore.getState();
    if (workflowUpdated) {
      const timer = setTimeout(() => {
        setWorkflowUpdated(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // REMOVED: Sync panel state with component state
  // This was causing workflow state inconsistency - panel store should reflect pipeline store, not component state
  // The real workflow state is managed by pipeline store
  
  // Only sync necessary UI state to panel for display purposes
  useEffect(() => {
    setCurrentSteps(currentSteps);
    setStepsLoaded(stepsLoaded);
    setPanelIsCompleted(isCompleted);
    // REMOVED: setCurrentStepIndex - this should come from pipeline store only
  }, [currentSteps, stepsLoaded, isCompleted, setCurrentSteps, setStepsLoaded, setPanelIsCompleted]);

  // Set up handlers in the store
  useEffect(() => {
    setOnConfirmWorkflowUpdate(handleConfirmWorkflowUpdate);
    setOnRejectWorkflowUpdate(handleRejectWorkflowUpdate);
  }, [handleConfirmWorkflowUpdate, handleRejectWorkflowUpdate, setOnConfirmWorkflowUpdate, setOnRejectWorkflowUpdate]);

  // Set up navigation handler
  const setNavigationHandler = useCallback((handler: (stepIndex: number) => void) => {
    setOnNavigateToStep(handler);
  }, [setOnNavigateToStep]);

  return {
    processWorkflowUpdate,
    processStageStepsUpdate,
    handleConfirmWorkflowUpdate,
    handleRejectWorkflowUpdate,
    setNavigationHandler
  };
};