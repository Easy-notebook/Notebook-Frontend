/**
 * Workflow Control Component
 * ==========================
 *
 * Updated to use new state machine architecture
 * - Uses WorkflowState enum
 * - Uses WorkflowEvent enum
 * - Uses stateJSON for all state access
 * - No more context property
 */

import React, { useState, useEffect, useMemo } from 'react';
import { FaRedo, FaPlay, FaPause } from 'react-icons/fa';
import { Terminal } from 'lucide-react';
import { usePipelineStore } from '@/components/Scenario/Workflow/store/usePipelineStore';
import { useAIPlanningContextStore } from '@/components/Scenario/Workflow/store/aiPlanningContext';
import {
  useWorkflowStateMachine,
  WorkflowState,
  WorkflowEvent,
} from '@/components/Scenario/Workflow/store/workflowStateMachine';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useRouteStore from '@Store/routeStore';
import './WorkflowErrorCollector';
import { extractSectionTitle } from '@Notebook/utils/String';

const RUNNING_STATES: WorkflowState[] = [
  WorkflowState.STAGE_RUNNING,
  WorkflowState.STEP_RUNNING,
  WorkflowState.BEHAVIOR_RUNNING,
];

const TERMINAL_STATES: WorkflowState[] = [
  WorkflowState.COMPLETE,
  WorkflowState.FAILED,
  WorkflowState.CANCELED,
];

interface DerivedState {
  isExecuting: boolean;
  isPaused: boolean;
  isTerminal: boolean;
  canRetry: boolean;
  currentStepInfo: { name: string; progress?: string } | null;
  shouldRender: boolean;
}

interface AutoWorkflowControlsProps {
  isExecuting: boolean;
  isPaused: boolean;
  isTerminal: boolean;
  canRetry: boolean;
  currentStepInfo: { name: string; progress?: string } | null;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onStart: () => void;
}

const AutoWorkflowControls: React.FC<AutoWorkflowControlsProps> = ({
  isExecuting,
  isPaused,
  isTerminal,
  canRetry,
  currentStepInfo,
  onPause,
  onResume,
  onRetry,
  onStart,
}) => {
  const [ellipsis, setEllipsis] = useState('...');

  useEffect(() => {
    if (!isExecuting || isPaused) return;
    const interval = setInterval(() => {
      setEllipsis((prev) => (prev.length < 3 ? prev + '.' : '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isExecuting, isPaused]);

  const showStartButton = isTerminal || (!isExecuting && !isPaused);

  return (
    <div className="flex items-center gap-4 p-2 bg-white bg-opacity-25 backdrop-blur-md rounded-full shadow-lg border border-white/30">
      {currentStepInfo && (
        <div className="flex items-center gap-2 px-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-yellow-400' : isExecuting ? 'bg-theme-500 animate-pulse' : 'bg-green-500'}`}
          />
          <span className="text-sm font-medium text-gray-800">
            {extractSectionTitle(currentStepInfo.name)}
            {isPaused ? ' (Paused)' : isExecuting ? ellipsis : ' ✓'}
            {currentStepInfo.progress && (
              <span className="ml-2 text-xs text-gray-600">({currentStepInfo.progress})</span>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isExecuting && !isPaused && (
          <button
            onClick={onPause}
            title="Stop Workflow"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaPause size={16} className="text-yellow-600" />
          </button>
        )}

        {isPaused && (
          <button
            onClick={onResume}
            title="Resume Workflow"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaPlay size={16} className="text-green-600" />
          </button>
        )}

        {canRetry && (
          <button
            onClick={onRetry}
            title="Retry Current Behavior"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaRedo size={16} className="text-orange-600" />
          </button>
        )}

        {showStartButton && (
          <button
            onClick={onStart}
            title="Start/Restart Workflow"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaPlay size={16} className="text-theme-600" />
          </button>
        )}
      </div>
    </div>
  );
};

const WorkflowControl: React.FC<{ fallbackViewMode?: string }> = ({ fallbackViewMode }) => {
  const { workflowTemplate } = usePipelineStore();
  const { addThinkingLog } = useAIPlanningContextStore();
  const { currentState, stateJSON, transition, startWorkflow, reset, cancel } =
    useWorkflowStateMachine();
  const { setShowCommandInput } = useAIAgentStore();
  const { currentView } = useRouteStore();

  // Get current location from stateJSON
  const currentLocation = stateJSON.observation?.location?.current;
  const currentStageId = currentLocation?.stage_id;
  const currentStepId = currentLocation?.step_id;

  const prerequisitesMet = useMemo(() => {
    return !!workflowTemplate;
  }, [workflowTemplate]);

  const derivedState = useMemo<DerivedState>(() => {
    if (!prerequisitesMet) {
      return {
        isExecuting: false,
        isPaused: false,
        isTerminal: false,
        canRetry: false,
        currentStepInfo: null,
        shouldRender: true,
      };
    }
    if (!workflowTemplate?.stages || !Array.isArray(workflowTemplate.stages)) {
      return {
        isExecuting: false,
        isPaused: false,
        isTerminal: false,
        canRetry: false,
        currentStepInfo: null,
        shouldRender: false,
      };
    }
    const stage = workflowTemplate.stages.find((s: any) => s.id === currentStageId);
    const step = stage?.steps?.find((st: any) => st.id === currentStepId);
    const completedStepsCount = stage?.steps?.findIndex((st: any) => st.id === currentStepId) ?? 0;
    const totalSteps = stage?.steps?.length ?? 0;

    return {
      isExecuting: RUNNING_STATES.includes(currentState),
      isPaused: false, // No PAUSED state in new state machine
      isTerminal: TERMINAL_STATES.includes(currentState),
      canRetry: currentState === WorkflowState.BEHAVIOR_COMPLETED,
      currentStepInfo: step
        ? {
            name: step.title || `步骤: ${step.id}`,
            progress: `${completedStepsCount + 1}/${totalSteps}`,
          }
        : stage
          ? { name: stage.title || `阶段: ${stage.id}` }
          : { name: '准备中...' },
      shouldRender: true,
    };
  }, [prerequisitesMet, workflowTemplate, currentStageId, currentStepId, currentState]);

  const isExecuting = derivedState.isExecuting;
  const isPaused = derivedState.isPaused;
  const isTerminal = derivedState.isTerminal;
  const canRetry = derivedState.canRetry;
  const currentStepInfo = derivedState.currentStepInfo;
  const shouldRender = derivedState.shouldRender;

  const onPause = () => cancel();
  const onResume = () => {
    // Resume from current context
    if (currentStageId) {
      startWorkflow(currentStageId);
    }
  };
  const onRetry = () => transition(WorkflowEvent.NEXT_BEHAVIOR);
  const onStart = () => {
    addThinkingLog('User started the PCS agent');
    reset();
    // Start from the first stage
    if (workflowTemplate?.stages?.[0]?.id) {
      startWorkflow(workflowTemplate.stages[0].id);
    }
  };

  if (!shouldRender) return null;

  // Only show in workspace view
  if (currentView !== 'workspace') return null;

  // Check if in IDLE state (not executing, not paused, not terminal, no current step)
  const isIdle = !isExecuting && !isPaused && !isTerminal && !currentStepInfo;

  // Determine bottom position based on view mode (demo mode has navigation bar at bottom)
  const bottomPosition = fallbackViewMode === 'demo' ? 'bottom-28' : 'bottom-6';

  // If IDLE, show compact command line trigger
  if (isIdle) {
    return (
      <div className={`absolute ${bottomPosition} right-6 z-50`}>
        <button
          onClick={() => setShowCommandInput(true)}
          className="p-2 rounded-full bg-white dark:bg-gray-800 bg-opacity-25 dark:bg-opacity-30 backdrop-blur-md shadow-lg border border-white/30 dark:border-gray-600/30 hover:bg-opacity-35 dark:hover:bg-opacity-40 transition-all hover:scale-105"
          title="Open AI Command Bar"
          aria-label="Open AI Command Bar"
        >
          <Terminal size={20} className="text-gray-800 dark:text-gray-200" />
        </button>
      </div>
    );
  }

  // Otherwise show workflow controls
  return (
    <div className={`absolute ${bottomPosition} right-6 z-50`}>
      <AutoWorkflowControls
        isExecuting={isExecuting}
        isPaused={isPaused}
        isTerminal={isTerminal}
        canRetry={canRetry}
        currentStepInfo={currentStepInfo}
        onPause={onPause}
        onResume={onResume}
        onRetry={onRetry}
        onStart={onStart}
      />
    </div>
  );
};

export default WorkflowControl;
