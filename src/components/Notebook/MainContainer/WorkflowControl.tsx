import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FaRedo, FaPlay, FaPause } from 'react-icons/fa';
import { usePipelineStore } from '../../Senario/Workflow/store/usePipelineStore';
import { useAIPlanningContextStore } from '../../Senario/Workflow/store/aiPlanningContext';
import { useWorkflowStateMachine, WORKFLOW_STATES, EVENTS, WorkflowState } from '../../Senario/Workflow/store/workflowStateMachine';
import usePreStageStore from '../../Senario/Workflow/store/preStageStore';
import './WorkflowErrorCollector'; // Initialize error collector
import { extractSectionTitle} from '../utils/String';

// 定义可运行状态集合，方便判断
const RUNNING_STATES: WorkflowState[] = [
  WORKFLOW_STATES.STAGE_RUNNING,
  WORKFLOW_STATES.STEP_RUNNING,
  WORKFLOW_STATES.BEHAVIOR_RUNNING,
  WORKFLOW_STATES.ACTION_RUNNING,
];

// 定义终端/可重置状态集合
const TERMINAL_STATES: WorkflowState[] = [
  WORKFLOW_STATES.WORKFLOW_COMPLETED,
  WORKFLOW_STATES.ERROR,
  WORKFLOW_STATES.CANCELLED,
];

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

/**
 * UI子组件：负责渲染控制按钮和状态显示
 */
const AutoWorkflowControls: React.FC<AutoWorkflowControlsProps> = ({
  isExecuting,
  isPaused,
  isTerminal,
  canRetry,
  currentStepInfo,
  onPause,
  onResume,
  onRetry,
  onStart
}) => {
  const [ellipsis, setEllipsis] = useState('...');

  useEffect(() => {
    if (!isExecuting || isPaused) return;
    const interval = setInterval(() => {
      setEllipsis(prev => (prev.length < 3 ? prev + '.' : '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isExecuting, isPaused]);

  const showStartButton = isTerminal || (!isExecuting && !isPaused);

  return (
    <div className="flex items-center gap-4 p-2 bg-white bg-opacity-25 backdrop-blur-md rounded-full shadow-lg border border-white/30">
      {/* 状态显示 */}
      {currentStepInfo && (
        <div className="flex items-center gap-2 px-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-yellow-400' : isExecuting ? 'bg-theme-500 animate-pulse' : 'bg-green-500'}`} />
          <span className="text-sm font-medium text-gray-800">
            {extractSectionTitle(currentStepInfo.name)}
            {isPaused ? ' (Paused)' : isExecuting ? ellipsis : ' ✓'}
            {currentStepInfo.progress && <span className="ml-2 text-xs text-gray-600">({currentStepInfo.progress})</span>}
          </span>
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex items-center gap-2">
        {isExecuting && !isPaused && (
          <button onClick={onPause} title="Stop Workflow" className="p-2 rounded-full hover:bg-black/10 transition-colors">
            <FaPause size={16} className="text-yellow-600" />
          </button>
        )}
        
        {isPaused && (
          <button onClick={onResume} title="Resume Workflow" className="p-2 rounded-full hover:bg-black/10 transition-colors">
            <FaPlay size={16} className="text-green-600" />
          </button>
        )}

        {canRetry && (
           <button onClick={onRetry} title="Retry Current Behavior" className="p-2 rounded-full hover:bg-black/10 transition-colors">
            <FaRedo size={16} className="text-orange-600" />
          </button>
        )}
        
        {showStartButton && (
          <button onClick={onStart} title="Start/Restart Workflow" className="p-2 rounded-full hover:bg-black/10 transition-colors">
            <FaPlay size={16} className="text-theme-600" />
          </button>
        )}
      </div>
    </div>
  );
};


/**
 * 主组件：负责状态逻辑和与Zustand stores的交互
 */
const WorkflowControl: React.FC<{ fallbackViewMode?: string }> = ({ fallbackViewMode = 'complete' }) => {
  // 从Zustand stores中获取状态和方法
  const { workflowTemplate } = usePipelineStore();
  const { addThinkingLog } = useAIPlanningContextStore();
  const { currentState, context: fsmContext, transition, startWorkflow, reset, cancel } = useWorkflowStateMachine();

  // 移除自动初始化，保持原有的用户驱动流程

  // 检查工作流执行的前提条件是否满足
  const prerequisitesMet = useMemo(() => {
    const { problem_description, currentFile } = usePreStageStore.getState();
    return !!(problem_description && currentFile && workflowTemplate);
  }, [workflowTemplate]);

  // 从FSM和Pipeline中派生出UI所需的状态
  const derivedState = useMemo(() => {
    if (!prerequisitesMet) {
      return {
        isExecuting: false,
        isPaused: false,
        isTerminal: false,
        canRetry: false,
        currentStepInfo: null,
      };
    }

    // 如果workflowTemplate不存在，返回默认状态（不显示控制组件）
    if (!workflowTemplate?.stages || !Array.isArray(workflowTemplate.stages)) {
      return {
        isExecuting: false,
        isPaused: false,
        isTerminal: false,
        canRetry: false,
        currentStepInfo: null,
        shouldRender: false, // 添加标志表示不应该渲染
      };
    }

    const stage = workflowTemplate.stages.find(s => s.id === fsmContext.currentStageId);
    const step = stage?.steps?.find(st => st.id === fsmContext.currentStepId);
    const completedStepsCount = stage?.steps?.findIndex(st => st.id === fsmContext.currentStepId) ?? 0;
    const totalSteps = stage?.steps?.length ?? 0;

    return {
      isExecuting: RUNNING_STATES.includes(currentState),
      isPaused: currentState === WORKFLOW_STATES.CANCELLED,
      isTerminal: TERMINAL_STATES.includes(currentState),
      canRetry: currentState === WORKFLOW_STATES.BEHAVIOR_COMPLETED, // 只有在反馈阶段才可重试
      currentStepInfo: step ? {
        name: step.title || `步骤: ${step.id}`,
        progress: `${completedStepsCount + 1}/${totalSteps}`,
      } : (stage ? { name: stage.title || `阶段: ${stage.id}` } : { name: '准备中...' }),
    };
  }, [prerequisitesMet, workflowTemplate, currentState, fsmContext]);

  /**
   * 记录日志 (Memoized)
   */
  const recordLog = useCallback((action: string) => {
    addThinkingLog(
      JSON.stringify({
        timestamp: Date.now(),
        action,
        stageId: fsmContext.currentStageId,
        stepId: fsmContext.currentStepId,
        behaviorId: fsmContext.currentBehaviorId,
        stateMachineState: currentState,
      })
    );
  }, [addThinkingLog, fsmContext, currentState]);

  const handleStart = useCallback(() => {
    if (!workflowTemplate) return;

    recordLog('start_workflow_button_clicked');
    
    // 如果工作流处于可重置状态，先重置
    if (TERMINAL_STATES.includes(currentState)) {
      reset();
    }
    
    // 延迟以确保reset状态更新完毕
    setTimeout(() => {
      const firstStage = workflowTemplate.stages[0];
      if (firstStage) {
        // 调用FSM的startWorkflow，FSM的副作用将处理后续所有逻辑
        const firstStepId = firstStage.steps[0]?.id;
        if (firstStepId) {
          startWorkflow({ stageId: firstStage.id, stepId: firstStepId });
        } else {
          console.error('No steps found in the first stage.');
          transition(EVENTS.FAIL, { error: 'No steps in first stage' });
        }
      } else {
        console.error("工作流模板中没有找到任何阶段。");
        transition(EVENTS.FAIL, { error: "No stages in template" });
      }
    }, 50);
  }, [workflowTemplate, currentState, reset, startWorkflow, transition, recordLog]);
  
  /**
   * 暂停工作流
   */
  const handlePause = useCallback(() => {
    recordLog('pause_button_clicked');
    cancel(); // 调用FSM的cancel方法，进入CANCELLED状态
  }, [cancel, recordLog]);

  /**
   * 恢复工作流 (实际上是重启)
   */
  const handleResume = useCallback(() => {
    recordLog('resume_button_clicked');
    handleStart(); // 恢复逻辑与开始/重启逻辑相同
  }, [handleStart, recordLog]);

  /**
   * 重试当前行为
   */
  const handleRetry = useCallback(() => {
    recordLog('retry_button_clicked');
    // 直接向FSM发送RETRY_BEHAVIOR事件
    transition(EVENTS.NEXT_BEHAVIOR);
  }, [transition, recordLog]);
  
  useEffect(() => {
    if (prerequisitesMet && currentState === WORKFLOW_STATES.IDLE) {
      handleStart();
    }
  }, [prerequisitesMet, currentState, handleStart]);

  if (currentState === WORKFLOW_STATES.IDLE) {
    return null;
  }

  if (!prerequisitesMet) {
    return (
        <div className="fixed bottom-10 right-10 flex items-center gap-2 p-3 bg-gray-200/50 backdrop-blur-sm rounded-lg shadow">
            <span className="text-sm text-gray-600">Waiting for workflow configuration...</span>
        </div>
    );
  }

  // 如果workflow模板不存在，不渲染控制组件
  if (derivedState.shouldRender === false) {
    return null;
  }

  return (
    <div className="fixed bottom-10 right-10" style={{ zIndex: fallbackViewMode === 'demo' ? 9999 : 1000 }}>
      <AutoWorkflowControls
        isExecuting={derivedState.isExecuting}
        isPaused={derivedState.isPaused}
        isTerminal={derivedState.isTerminal}
        canRetry={derivedState.canRetry}
        currentStepInfo={derivedState.currentStepInfo}
        onPause={handlePause}
        onResume={handleResume}
        onRetry={handleRetry}
        onStart={handleStart}
      />
    </div>
  );
};

export default WorkflowControl;