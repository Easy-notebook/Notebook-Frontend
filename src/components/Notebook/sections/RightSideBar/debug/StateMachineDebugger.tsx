/**
 * State Machine Debugger
 * ======================
 *
 * Updated to use new state machine architecture
 * - Uses WorkflowState and WorkflowEvent enums
 * - Uses stateJSON for all state access
 * - Uses transitionHistory instead of executionHistory
 * - Removed ACTION-related events (not in new architecture)
 */

import React, { useState, useMemo } from 'react';
import {
  useWorkflowStateMachine,
  WorkflowEvent,
} from '@/components/Scenario/Workflow/store/workflowStateMachine';
import { usePipelineStore } from '@/components/Scenario/Workflow/store/usePipelineStore';
import {
  Settings,
  ChevronDown,
  Trash2,
  Clock,
  ArrowRight,
  Activity,
  Cpu,
  Play,
  Square,
  CheckCircle,
  XCircle,
  GitBranch,
  Download,
  Shuffle,
  Repeat,
} from 'lucide-react';
import { extractSectionTitle } from '../../../utils/String';

const StateMachineDebugger: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [maxEntries, setMaxEntries] = useState(25);

  // Get state machine and pipeline state from their respective stores
  const stateMachine = useWorkflowStateMachine();
  const { workflowTemplate } = usePipelineStore();

  // Use transitionHistory from new state machine
  const displayedHistory = useMemo(() => {
    return [...stateMachine.transitionHistory].reverse().slice(0, maxEntries);
  }, [stateMachine.transitionHistory, maxEntries]);

  // Get current location from stateJSON
  const currentLocation = stateMachine.stateJSON.observation?.location?.current;
  const currentStageId = currentLocation?.stage_id;
  const currentStepId = currentLocation?.step_id;
  const currentBehaviorId = currentLocation?.behavior_id;

  const clearHistory = () => {
    alert(
      "Clearing display. The store's history remains until the page is reloaded or the FSM is reset."
    );
  };

  const getStateColor = (state: string) => {
    if (state.includes('completed')) return 'text-green-600';
    if (state.includes('running')) return 'text-theme-600';
    if (state.includes('failed')) return 'text-red-600';
    if (state.includes('idle') || state.includes('canceled')) return 'text-gray-500';
    return 'text-gray-800';
  };

  const getEventIcon = (event: WorkflowEvent) => {
    const icons: Record<string, React.ReactNode> = {
      [WorkflowEvent.START_WORKFLOW]: <Play size={8} />,
      [WorkflowEvent.START_STAGE]: <Play size={8} />,
      [WorkflowEvent.START_STEP]: <Play size={8} />,
      [WorkflowEvent.START_BEHAVIOR]: <Shuffle size={8} style={{ color: '#8B5CF6' }} />,
      [WorkflowEvent.COMPLETE_BEHAVIOR]: <CheckCircle size={8} style={{ color: '#8B5CF6' }} />,
      [WorkflowEvent.COMPLETE_STEP]: <CheckCircle size={8} />,
      [WorkflowEvent.COMPLETE_STAGE]: <CheckCircle size={8} />,
      [WorkflowEvent.COMPLETE_WORKFLOW]: <CheckCircle size={8} />,
      [WorkflowEvent.NEXT_BEHAVIOR]: <ArrowRight size={8} />,
      [WorkflowEvent.NEXT_STEP]: <ArrowRight size={8} />,
      [WorkflowEvent.NEXT_STAGE]: <ArrowRight size={8} />,
      [WorkflowEvent.FAIL]: <XCircle size={8} />,
      [WorkflowEvent.CANCEL]: <Square size={8} />,
    };
    return icons[event] || <GitBranch size={8} />;
  };

  const getEventStyle = (event: WorkflowEvent) => {
    if (event === WorkflowEvent.START_BEHAVIOR || event === WorkflowEvent.COMPLETE_BEHAVIOR) {
      return {
        borderColor: 'rgba(139, 92, 246, 0.3)',
        color: '#8B5CF6',
      };
    }
    if (event === WorkflowEvent.NEXT_BEHAVIOR) {
      return {
        borderColor: 'rgba(249, 115, 22, 0.3)',
        color: '#F97316',
      };
    }
    return {
      borderColor: 'rgba(107, 114, 128, 0.3)',
      color: '#6B7280',
    };
  };

  const exportStateMachine = () => {
    const exportData = {
      exportTimestamp: new Date().toISOString(),
      currentStatus: {
        currentState: stateMachine.currentState,
        stateJSON: stateMachine.stateJSON,
      },
      workflowTemplate: workflowTemplate,
      transitionHistory: stateMachine.transitionHistory,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `state-machine-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="border rounded-lg shadow-sm mt-4"
      style={{
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '11px',
        lineHeight: '1.4',
        borderColor: 'rgba(65, 184, 131, 0.2)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 border-b cursor-pointer transition-all duration-200"
        style={{
          borderBottomColor: 'rgba(65, 184, 131, 0.2)',
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu size={8} style={{ color: '#41B883' }} />
            <h3
              className="text-sm font-semibold"
              style={{
                background: 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              State Machine Debugger
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-700 dark:text-white">
              {stateMachine.transitionHistory.length} transitions
            </span>
            <ChevronDown
              size={8}
              className={`transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
              style={{ color: '#41B883' }}
            />
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3">
          {/* Current Status */}
          <div
            className="mb-3 p-3 rounded-md border"
            style={{
              borderColor: 'rgba(65, 184, 131, 0.15)',
            }}
          >
            <div className="flex items-center space-x-2 mb-2">
              <Activity size={8} style={{ color: '#41B883' }} />
              <h4
                className="text-xs font-semibold"
                style={{
                  background: 'linear-gradient(to right, #41B883, #3490DC)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Current Status
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center space-x-1 col-span-2">
                <Shuffle size={8} className="text-gray-700 dark:text-white" />
                <span className="text-gray-700 dark:text-white font-bold">State:</span>
                <span
                  className="ml-1 font-medium font-mono px-1.5 py-0.5 rounded border"
                  style={{
                    borderColor: 'rgba(101, 116, 205, 0.3)',
                    color: '#6574CD',
                  }}
                >
                  {stateMachine.currentState}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Square size={8} className="text-gray-700 dark:text-white" />
                <span className="text-gray-700 dark:text-white">Stage:</span>
                <span className="ml-1 font-mono font-medium" style={{ color: '#6574CD' }}>
                  {extractSectionTitle(currentStageId || '') || 'null'}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Play size={8} className="text-gray-700 dark:text-white" />
                <span className="text-gray-700 dark:text-white">Step:</span>
                <span className="ml-1 font-mono font-medium" style={{ color: '#6574CD' }}>
                  {extractSectionTitle(currentStepId || '') || 'null'}
                </span>
              </div>
              <div className="flex items-center space-x-1 col-span-2">
                <Repeat size={8} className="text-gray-700 dark:text-white" />
                <span className="text-gray-700 dark:text-white">Behavior:</span>
                <span className="ml-1 font-mono font-medium" style={{ color: '#6574CD' }}>
                  {currentBehaviorId || 'null'}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div
            className="mb-3 flex items-center justify-between py-2 border-b"
            style={{ borderBottomColor: 'rgba(65, 184, 131, 0.1)' }}
          >
            <div className="flex items-center space-x-2">
              <Settings size={8} className="text-gray-700 dark:text-white" />
              <label className="text-xs text-gray-700 dark:text-white">Max entries:</label>
              <select
                value={maxEntries}
                onChange={(e) => setMaxEntries(Number(e.target.value))}
                className="text-xs px-2 py-1 border-0 focus:outline-none"
                style={{
                  color: '#202124',
                  borderRadius: '4px',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={exportStateMachine}
                className="flex items-center space-x-1 text-xs px-2 py-1 font-medium transition-all duration-200 rounded-full"
                title="Export state machine debug data"
              >
                <Download size={8} />
                <span>Export</span>
              </button>
              <button
                onClick={clearHistory}
                className="flex items-center space-x-1 text-xs px-2 py-1 font-medium transition-colors duration-200 rounded text-gray-700 dark:text-white"
                style={{ border: 'none' }}
                title="This only clears the view, not the store's history."
              >
                <Trash2 size={8} />
                <span>Clear View</span>
              </button>
            </div>
          </div>

          {/* Transitions List */}
          <div className="space-y-0 max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {displayedHistory.length === 0 ? (
              <div className="text-center text-gray-500 py-4">No transitions yet</div>
            ) : (
              displayedHistory.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="py-2 px-0 border-b transition-colors duration-200"
                  style={{
                    borderBottomColor: 'rgba(65, 184, 131, 0.06)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`flex items-center space-x-1 px-2 py-0.5 text-xs font-medium border rounded-full`}
                        style={getEventStyle(entry.event)}
                      >
                        {getEventIcon(entry.event)}
                        <span>{entry.event}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-gray-500">
                        <Clock size={8} />
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 pl-1">
                    <div className="flex items-center space-x-2">
                      <span className={`font-mono ${getStateColor(entry.from)}`}>{entry.from}</span>
                      <ArrowRight size={8} className="text-gray-400" />
                      <span className={`font-medium font-mono ${getStateColor(entry.to)}`}>
                        {entry.to}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StateMachineDebugger;
