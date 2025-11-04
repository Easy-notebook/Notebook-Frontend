// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { useAIPlanningContextStore } from '../../Senario/Workflow/store/aiPlanningContext';
import { useWorkflowStateMachine } from '../../Senario/Workflow/store/workflowStateMachine';
import { 
  Brain, 
  ChevronDown, 
  Download, 
  Trash2, 
  Settings,
  Clock,
  Database,
  GitBranch,
  Activity,
  CheckSquare,
  ListTodo,
  Lightbulb,
  Zap,
  Target,
  CheckCircle
} from 'lucide-react';

interface ContextSnapshot {
  timestamp: number;
  currentTime: string;
  variables: any;
  toDoList: any[];
  thinking: any[];
  effect: any;
  stageStatus: any;
  checklist: any;
  changeType: string;
  changedFields: string[];
}

const AIPlanningContextDebugger: React.FC = () => {
  const [snapshots, setSnapshots] = useState<ContextSnapshot[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [maxEntries, setMaxEntries] = useState(15);
  const prevContextRef = useRef<any>({});

  // Get current context and state machine
  const context = useAIPlanningContextStore();
  const stateMachine = useWorkflowStateMachine();
  const {
    variables,
    toDoList,
    thinking,
    effect,
    stageStatus,
    checklist
  } = context;

  // Deep comparison function
  const deepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return false;
    if (typeof obj1 !== typeof obj2) return false;
    
    if (typeof obj1 !== 'object') return obj1 === obj2;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (let key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!deepEqual(obj1[key], obj2[key])) return false;
    }
    
    return true;
  };

  // Detect changes
  const detectChanges = (prev: any, current: any): string[] => {
    const changes: string[] = [];
    
    if (!deepEqual(prev.variables, current.variables)) changes.push('variables');
    if (!deepEqual(prev.toDoList, current.toDoList)) changes.push('toDoList');
    if (!deepEqual(prev.thinking, current.thinking)) changes.push('thinking');
    if (!deepEqual(prev.effect, current.effect)) changes.push('effect');
    if (!deepEqual(prev.stageStatus, current.stageStatus)) changes.push('stageStatus');
    if (!deepEqual(prev.checklist, current.checklist)) changes.push('checklist');
    
    return changes;
  };

  // Track context changes
  useEffect(() => {
    const currentContext = {
      variables,
      toDoList,
      thinking,
      effect,
      stageStatus,
      checklist
    };

    const changedFields = detectChanges(prevContextRef.current, currentContext);
    
    if (changedFields.length > 0) {
      const now = Date.now();
      const currentTime = new Date().toLocaleTimeString();
      
      const changeType = changedFields.length === 1 ? changedFields[0] : 
                        changedFields.length <= 3 ? changedFields.join(', ') : 
                        `${changedFields.length} fields`;

      const newSnapshot: ContextSnapshot = {
        timestamp: now,
        currentTime,
        variables: JSON.parse(JSON.stringify(variables)),
        toDoList: JSON.parse(JSON.stringify(toDoList)),
        thinking: JSON.parse(JSON.stringify(thinking)),
        effect: JSON.parse(JSON.stringify(effect)),
        stageStatus: JSON.parse(JSON.stringify(stageStatus)),
        checklist: JSON.parse(JSON.stringify(checklist)),
        changeType,
        changedFields
      };

      setSnapshots(prev => {
        const updated = [newSnapshot, ...prev];
        return updated.slice(0, maxEntries);
      });

      prevContextRef.current = currentContext;
    }
  }, [variables, toDoList, thinking, effect, stageStatus, checklist, maxEntries]);

  const clearHistory = () => {
    setSnapshots([]);
  };

  // Safe JSON serialization that handles undefined values
  const safeJSONStringify = (obj: any) => {
    try {
      return JSON.parse(JSON.stringify(obj, (key, value) => {
        // Replace undefined with null for JSON compatibility
        return value === undefined ? null : value;
      }));
    } catch (error) {
      console.warn('Failed to serialize object:', error);
      return null;
    }
  };

  const exportHistory = () => {
    const exportData = {
      exportTimestamp: Date.now(),
      exportTime: new Date().toISOString(),
      
      // Current AI Planning Context
      currentContext: {
        variables: safeJSONStringify(variables),
        toDoList: safeJSONStringify(toDoList),
        thinking: safeJSONStringify(thinking),
        effect: safeJSONStringify(effect),
        stageStatus: safeJSONStringify(stageStatus),
        checklist: safeJSONStringify(checklist)
      },
      
      // Current State Machine Status
      stateMachine: {
        currentState: stateMachine.currentState || null,
        currentStageId: stateMachine.currentStageId || null,
        currentStepId: stateMachine.currentStepId || null,
        workflow: safeJSONStringify(stateMachine.workflow),
        autoAdvance: stateMachine.autoAdvance || false,
        executionHistory: safeJSONStringify(stateMachine.executionHistory) || [],
        metadata: safeJSONStringify(stateMachine.metadata),
        isTransitioning: stateMachine.isTransitioning || false,
        lastEvent: stateMachine.lastEvent || null,
        lastTransition: stateMachine.lastTransition || null
      },
      
      // Historical Snapshots
      historySnapshots: {
        totalSnapshots: snapshots.length,
        snapshots: snapshots.map(snapshot => ({
          ...snapshot,
          exportedAt: new Date(snapshot.timestamp).toISOString()
        }))
      }
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-planning-context-state-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getChangeColor = (changeType: string) => {
    const colors: Record<string, string> = {
      'variables': 'bg-slate-100 text-slate-700 border border-slate-300',
      'toDoList': 'bg-slate-100 text-slate-700 border border-slate-300',
      'thinking': 'bg-slate-100 text-slate-700 border border-slate-300',
      'effect': 'bg-slate-100 text-slate-700 border border-slate-300',
      'stageStatus': 'bg-slate-100 text-slate-700 border border-slate-300',
      'checklist': 'bg-slate-100 text-slate-700 border border-slate-300'
    };
    
    for (const [key, color] of Object.entries(colors)) {
      if (changeType.includes(key)) return color;
    }
    
    return 'bg-slate-100 text-slate-700 border border-slate-300';
  };

  const getChangeIcon = (changeType: string) => {
    const icons: Record<string, React.ReactNode> = {
      'variables': <Database size={8} />,
      'toDoList': <ListTodo size={8} />,
      'thinking': <Lightbulb size={8} />,
      'effect': <Zap size={8} />,
      'stageStatus': <Activity size={8} />,
      'checklist': <CheckSquare size={8} />
    };
    
    for (const [key, icon] of Object.entries(icons)) {
      if (changeType.includes(key)) return icon;
    }
    
    return <GitBranch size={8} />;
  };

  const formatValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) return `Array[${value.length}]`;
    if (typeof value === 'object') return `Object{${Object.keys(value).length}}`;
    return String(value);
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm mt-4" style={{
      fontFamily: 'ui-sans-serif, system-ui, sans-serif', 
      fontSize: '11px', 
      lineHeight: '1.4',
      borderColor: 'rgba(65, 184, 131, 0.2)'
    }}>
      {/* Header */}
      <div 
        className="px-3 py-2 border-b cursor-pointer transition-all duration-200"
        style={{
          borderBottomColor: 'rgba(65, 184, 131, 0.2)',
          background: 'linear-gradient(135deg, rgba(65, 184, 131, 0.02), rgba(52, 144, 220, 0.02))'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(65, 184, 131, 0.05), rgba(52, 144, 220, 0.05))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(65, 184, 131, 0.02), rgba(52, 144, 220, 0.02))';
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain size={8} style={{color: '#41B883'}} />
            <h3 className="text-sm font-semibold" style={{
              background: 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              AI Planning Context History
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs" style={{color: '#35495E'}}>
              {snapshots.length} snapshots
            </span>
            <ChevronDown 
              size={8}
              className={`transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
              style={{color: '#41B883'}}
            />
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3">
          {/* Current Status */}
          <div className="mb-3 p-3 rounded-md border" style={{
            background: 'linear-gradient(135deg, rgba(65, 184, 131, 0.04), rgba(52, 144, 220, 0.04))',
            borderColor: 'rgba(65, 184, 131, 0.15)'
          }}>
            <div className="flex items-center space-x-2 mb-2">
              <Target size={8} style={{color: '#41B883'}} />
              <h4 className="text-xs font-semibold" style={{
                background: 'linear-gradient(to right, #41B883, #3490DC)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent'
              }}>Current Context</h4>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center space-x-1">
                <Database size={8} style={{color: '#35495E'}} />
                <span style={{color: '#35495E'}}>Variables:</span>
                <span className="ml-1 font-mono font-medium" style={{color: '#3490DC'}}>
                  {formatValue(variables)}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <ListTodo size={8} style={{color: '#35495E'}} />
                <span style={{color: '#35495E'}}>ToDo List:</span>
                <span className="ml-1 font-mono font-medium" style={{color: '#41B883'}}>
                  {formatValue(toDoList)}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Lightbulb size={8} style={{color: '#35495E'}} />
                <span style={{color: '#35495E'}}>Thinking:</span>
                <span className="ml-1 font-mono font-medium" style={{color: '#6574CD'}}>
                  {formatValue(thinking)}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Zap size={8} style={{color: '#35495E'}} />
                <span style={{color: '#35495E'}}>Effect:</span>
                <span className="ml-1 font-mono font-medium" style={{color: '#3490DC'}}>
                  {formatValue(effect)}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity size={8} style={{color: '#35495E'}} />
                <span style={{color: '#35495E'}}>Stage Status:</span>
                <span className="ml-1 font-mono font-medium" style={{color: '#41B883'}}>
                  {formatValue(stageStatus)}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <CheckSquare size={8} style={{color: '#35495E'}} />
                <span style={{color: '#35495E'}}>Checklist:</span>
                <span className="ml-1 font-mono font-medium" style={{color: '#6574CD'}}>
                  {formatValue(checklist)}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mb-3 flex items-center justify-between py-2 border-b" style={{borderBottomColor: 'rgba(65, 184, 131, 0.1)'}}>
            <div className="flex items-center space-x-2">
              <Settings size={8} style={{color: '#35495E'}} />
              <label className="text-xs" style={{color: '#35495E'}}>Max entries:</label>
              <select 
                value={maxEntries} 
                onChange={(e) => setMaxEntries(Number(e.target.value))}
                className="text-xs px-2 py-1 border-0 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={exportHistory}
                className="flex items-center space-x-1 text-xs px-2 py-1 font-medium transition-all duration-200 rounded-full bg-theme-50"
                title="Export current context and state machine status"
              >
                <Download size={8} />
                <span>Export</span>
              </button>
              <button
                onClick={clearHistory}
                className="flex items-center space-x-1 text-xs px-2 py-1 font-medium transition-colors duration-200 rounded"
                style={{
                  color: '#35495E',
                  backgroundColor: 'transparent',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Trash2 size={8} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Snapshots List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {snapshots.length === 0 ? (
              <div className="text-xs text-center py-4 text-slate-500">
                No context changes recorded yet
              </div>
            ) : (
              snapshots.map((snapshot, index) => (
                <div key={`${snapshot.timestamp}-${index}`} className="rounded-md p-3 mb-2 transition-all duration-200 hover:shadow-sm bg-white border border-slate-200 hover:border-slate-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getChangeColor(snapshot.changeType)}`}>
                        {getChangeIcon(snapshot.changeType)}
                        <span>{snapshot.changeType}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-slate-500">
                        <Clock size={8} />
                        <span>{snapshot.currentTime}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs">
                    <div className="mb-2">
                      <span className="text-slate-600">Changed fields:</span>
                      <span className="ml-1 font-medium text-slate-700">
                        {snapshot.changedFields.join(', ')}
                      </span>
                    </div>

                    {/* Show detailed changes for important fields */}
                    {snapshot.changedFields.includes('toDoList') && (
                      <div className="mb-1">
                        <div className="flex items-center space-x-1 mb-1">
                          <ListTodo size={8} style={{color: '#35495E'}} />
                          <span style={{color: '#35495E'}}>ToDo List:</span>
                        </div>
                        <div className="ml-2 text-xs p-2 rounded bg-slate-50 border border-slate-200">
                          {snapshot.toDoList.length === 0 ? (
                            <div className="flex items-center space-x-1">
                              <CheckCircle size={8} style={{color: '#41B883'}} />
                              <span style={{color: '#41B883'}} className="font-medium">Empty (completed)</span>
                            </div>
                          ) : (
                            <ul className="space-y-1">
                              {snapshot.toDoList.slice(0, 3).map((item, i) => (
                                <li key={i} className="truncate text-slate-700 flex items-start space-x-1">
                                  <span className="text-slate-400">•</span>
                                  <span>{typeof item === 'string' ? item : JSON.stringify(item).slice(0, 50)}</span>
                                </li>
                              ))}
                              {snapshot.toDoList.length > 3 && (
                                <li className="text-slate-500">... and {snapshot.toDoList.length - 3} more</li>
                              )}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    {snapshot.changedFields.includes('variables') && (
                      <div className="mb-1">
                        <div className="flex items-center space-x-1 mb-1">
                          <Database size={8} style={{color: '#35495E'}} />
                          <span style={{color: '#35495E'}}>Variables:</span>
                        </div>
                        <div className="ml-2 text-xs p-2 rounded font-mono bg-slate-50 border border-slate-200">
                          {Object.keys(snapshot.variables).length === 0 ? (
                            <span className="text-slate-500">Empty</span>
                          ) : (
                            Object.entries(snapshot.variables).slice(0, 3).map(([key, value]) => (
                              <div key={key} className="truncate">
                                <span className="text-slate-600 font-medium">{key}:</span>
                                <span className="text-slate-700"> {formatValue(value)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Full snapshot details */}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-slate-600 hover:text-slate-800 transition-colors duration-200 text-xs">
                        Full Snapshot
                      </summary>
                      <pre className="text-xs p-3 rounded mt-1 overflow-auto max-h-40 font-mono bg-slate-50 border border-slate-200 text-slate-600">
                        {JSON.stringify({
                          variables: snapshot.variables,
                          toDoList: snapshot.toDoList,
                          thinking: snapshot.thinking,
                          effect: snapshot.effect,
                          stageStatus: snapshot.stageStatus,
                          checklist: snapshot.checklist
                        }, null, 2)}
                      </pre>
                    </details>
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

export default AIPlanningContextDebugger;