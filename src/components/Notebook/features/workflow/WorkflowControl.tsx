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
import { FaRedo, FaPlay, FaStop, FaPause } from 'react-icons/fa';
import { Terminal } from 'lucide-react';
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

interface PlannedStage {
  stage_id: string;
  title: string;
  task: string;
  acceptance: string;
  planning_complete: boolean;
  focus?: string;
  notes?: string;
}

interface PlannedStep {
  step_id: string;
  title: string;
  task: string;
  acceptance: string;
  planning_complete: boolean;
}

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
  onStop: () => void;
  onRetry: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
}

const AutoWorkflowControls: React.FC<AutoWorkflowControlsProps> = ({
  isExecuting,
  isPaused,
  isTerminal,
  canRetry,
  currentStepInfo,
  onStop,
  onRetry,
  onStart,
  onPause,
  onResume,
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
            className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-yellow-500' : isExecuting ? 'bg-blue-500 animate-pulse' : isTerminal ? 'bg-gray-400' : 'bg-green-500'}`}
          />
          <span className="text-sm font-medium text-gray-800">
            {extractSectionTitle(currentStepInfo.name)}
            {isPaused ? ' (已暂停)' : isExecuting ? ellipsis : isTerminal ? ' (Stopped)' : ' ✓'}
            {currentStepInfo.progress && (
              <span className="ml-2 text-xs text-gray-600">({currentStepInfo.progress})</span>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isPaused && (
          <button
            onClick={onResume}
            title="Resume Workflow"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaPlay size={16} className="text-green-600" />
          </button>
        )}

        {isExecuting && !isPaused && (
          <button
            onClick={onPause}
            title="Pause Workflow"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaPause size={16} className="text-yellow-600" />
          </button>
        )}

        {(isExecuting || isPaused) && (
          <button
            onClick={onStop}
            title="Stop Workflow"
            className="p-2 rounded-full hover:bg-black/10 transition-colors"
          >
            <FaStop size={16} className="text-red-600" />
          </button>
        )}

        {canRetry && (
          <button
            onClick={onRetry}
            title="Continue to Next Behavior"
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
            <FaPlay size={16} className="text-green-600" />
          </button>
        )}
      </div>
    </div>
  );
};

const WorkflowControl: React.FC<{ fallbackViewMode?: string }> = ({ fallbackViewMode }) => {
  const { addThinkingLog } = useAIPlanningContextStore();
  const { currentState, stateJSON, transition, reset, cancel, pause, resume } =
    useWorkflowStateMachine();
  const { showCommandInput, setShowCommandInput } = useAIAgentStore();
  const { currentView } = useRouteStore();

  // ✅ Get current location from stateJSON (new architecture)
  const currentLocation = stateJSON.observation?.location?.current;
  const currentStageId = currentLocation?.stage_id;
  const currentStepId = currentLocation?.step_id;

  // ✅ Get stages and steps from stateJSON (memoized to avoid reference changes)
  const plannedStages = useMemo(
    () => stateJSON.observation?.location?.progress?.stages?.planned || [],
    [stateJSON.observation?.location?.progress?.stages?.planned]
  );
  const plannedSteps = useMemo(
    () => stateJSON.observation?.location?.progress?.steps?.planned || [],
    [stateJSON.observation?.location?.progress?.steps?.planned]
  );

  const prerequisitesMet = useMemo(() => {
    return plannedStages.length > 0;
  }, [plannedStages]);

  const derivedState = useMemo<DerivedState>(() => {
    const isRunning = RUNNING_STATES.includes(currentState);
    const isTerminalState = TERMINAL_STATES.includes(currentState);

    // Even if prerequisites are not met, we should show execution state if workflow is running
    if (!prerequisitesMet) {
      return {
        isExecuting: isRunning,
        isPaused: false,
        isTerminal: isTerminalState,
        canRetry: false,
        currentStepInfo: isRunning || isTerminalState ? { name: '加载中...' } : null,
        shouldRender: true,
      };
    }

    if (!plannedStages || !Array.isArray(plannedStages) || plannedStages.length === 0) {
      return {
        isExecuting: false,
        isPaused: false,
        isTerminal: false,
        canRetry: false,
        currentStepInfo: null,
        shouldRender: false,
      };
    }

    // ✅ Find stage and step from stateJSON
    const stage = plannedStages.find((s: PlannedStage) => s.stage_id === currentStageId);
    const step = plannedSteps.find((st: PlannedStep) => st.step_id === currentStepId);
    const completedStepsCount = plannedSteps.findIndex(
      (st: PlannedStep) => st.step_id === currentStepId
    );
    const totalSteps = plannedSteps.length;

    // If workflow is running, paused, or terminal, we should show step info even if we don't have it yet
    const shouldShowStepInfo =
      isRunning ||
      isTerminalState ||
      currentState === WorkflowState.PAUSED ||
      currentStageId ||
      currentStepId;

    return {
      isExecuting: isRunning,
      isPaused: currentState === WorkflowState.PAUSED,
      isTerminal: isTerminalState,
      canRetry: currentState === WorkflowState.BEHAVIOR_COMPLETED,
      currentStepInfo: shouldShowStepInfo
        ? step
          ? {
              name: step.title || `步骤: ${step.step_id}`,
              progress: `${completedStepsCount >= 0 ? completedStepsCount + 1 : 0}/${totalSteps}`,
            }
          : stage
            ? { name: stage.title || `阶段: ${stage.stage_id}` }
            : { name: '准备中...' }
        : null,
      shouldRender: true,
    };
  }, [prerequisitesMet, plannedStages, plannedSteps, currentStageId, currentStepId, currentState]);

  const isExecuting = derivedState.isExecuting;
  const isPaused = derivedState.isPaused;
  const isTerminal = derivedState.isTerminal;
  const canRetry = derivedState.canRetry;
  const currentStepInfo = derivedState.currentStepInfo;
  const shouldRender = derivedState.shouldRender;

  const onStop = () => {
    console.log('[WorkflowControl] Stopping workflow...');
    cancel();
  };
  const onPause = () => {
    console.log('[WorkflowControl] Pausing workflow...');
    pause();
  };
  const onResume = () => {
    console.log('[WorkflowControl] Resuming workflow...');
    resume();
  };
  const onRetry = () => {
    console.log('[WorkflowControl] Continuing to next behavior...');
    transition(WorkflowEvent.NEXT_BEHAVIOR);
  };
  const onStart = () => {
    addThinkingLog('User started the PCS agent');
    reset();
    // ✅ Start workflow using new architecture
    // startWorkflow() will be called with planning request from UI
    // For now, just reset and let the workflow be started via planning request
    console.log('[WorkflowControl] Workflow reset, ready to start via planning request');
  };

  if (!shouldRender) return null;

  // Only show in workspace view
  if (currentView !== 'workspace') return null;

  // Check if in IDLE state (not executing, not paused, not terminal, no current step)
  // Also show terminal button if workflow is COMPLETE (user request)
  const isIdle =
    (!isExecuting && !isPaused && !isTerminal && !currentStepInfo) ||
    currentState === WorkflowState.COMPLETE;

  // Determine bottom position based on view mode (demo mode has navigation bar at bottom)
  const bottomPosition = fallbackViewMode === 'demo' ? 'bottom-28' : 'bottom-6';

  // If IDLE, show compact command line trigger
  if (isIdle) {
    return (
      <div className={`absolute ${bottomPosition} right-6 z-50`}>
        <button
          onClick={() => setShowCommandInput(!showCommandInput)}
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
        onStop={onStop}
        onPause={onPause}
        onResume={onResume}
        onRetry={onRetry}
        onStart={onStart}
      />
    </div>
  );
};

export default WorkflowControl;
