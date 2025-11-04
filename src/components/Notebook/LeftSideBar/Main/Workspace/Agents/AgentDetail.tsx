import React, { useState, useEffect } from 'react';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import { AGENT_PROFILES } from './agentConfig';
import useStore from '@Store/notebookStore';

interface AgentDetailProps {
  agentType: AgentType;
  onBack?: () => void;
}

const AgentDetail: React.FC<AgentDetailProps> = ({ agentType, onBack }) => {
  const { notebookId } = useStore();
  const [agentMemory, setAgentMemory] = useState<any>(null);

  const agentProfile = AGENT_PROFILES[agentType];

  useEffect(() => {
    if (!notebookId) return;

    const loadAgentMemory = () => {
      const memory = AgentMemoryService.getAgentMemory(notebookId, agentType);
      setAgentMemory(memory);
    };

    loadAgentMemory();
    
    // 监听存储变化 - localStorage变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'agent_memories_v2') {
        loadAgentMemory();
      }
    };
    
    // 监听自定义事件 - 内存变化
    const handleMemoryUpdate = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      if (detail?.notebookId === notebookId && detail?.agentType === agentType) {
        loadAgentMemory();
      }
    };
    
    // 设置定时器进行轮询更新
    const pollInterval = setInterval(() => {
      loadAgentMemory();
    }, 1000); // 每1秒检查一次（详情页更频繁）
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('agentMemoryUpdated', handleMemoryUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('agentMemoryUpdated', handleMemoryUpdate);
      clearInterval(pollInterval);
    };
  }, [notebookId, agentType]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getStatusBadge = (outcome: string) => {
    const colors = {
      success: 'bg-green-100 text-green-800',
      partial: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      blocked: 'bg-gray-100 text-gray-800'
    };
    return colors[outcome as keyof typeof colors] || colors.blocked;
  };

  if (!agentMemory) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-semibold" style={{ color: '#35495E' }}>{agentProfile.name}</h2>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg transition-colors"
              style={{ 
                background: 'rgba(65, 184, 131, 0.05)',
                color: '#35495E'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(65, 184, 131, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(65, 184, 131, 0.05)';
              }}
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Agent Introduction */}
        <div className="flex-1 overflow-y-auto p-6 align-center justify-center h-full flex">
          <div className="max-w-2xl mx-auto space-y-8 items-center justify-center">
            {/* Introduction */}
            <div>
              <h3 
                className="text-base font-medium mb-4" 
                style={{ 
                  backgroundImage: 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
                  color: 'transparent',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text'
                }}
              >
                About Me
              </h3>
              <div className="text-sm leading-relaxed" style={{ color: '#35495E', lineHeight: '1.6' }}>
                {agentProfile.introduction}
              </div>
            </div>

            {/* Key Capabilities - Compact */}
            <div>
              <h3 
                className="text-base font-medium mb-3" 
                style={{ 
                  backgroundImage: 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
                  color: 'transparent',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text'
                }}
              >
                Key Capabilities
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {agentProfile.capabilities.slice(0, 4).map((capability, idx) => (
                  <div key={idx} className="p-3 rounded-lg text-center" style={{ background: 'rgba(65, 184, 131, 0.03)' }}>
                    <div className="text-xs font-medium mb-1" style={{ color: '#41B883' }}>{capability.icon}</div>
                    <div className="text-sm font-medium" style={{ color: '#35495E' }}>{capability.name}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status & Configuration - Inline */}
            <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: 'rgba(65, 184, 131, 0.02)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: '#35495E' }}>Engine</div>
                <div className="text-xs" style={{ color: '#6B7280' }}>{agentProfile.engine}</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium" style={{ color: '#35495E' }}>Specialties</div>
                <div className="text-xs" style={{ color: '#6B7280' }}>{agentProfile.specialty.length} areas</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium" style={{ color: '#35495E' }}>Modes</div>
                <div className="text-xs" style={{ color: '#6B7280' }}>{agentProfile.modes.filter(m => m.enabled).length} active</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(65, 184, 131, 0.1)' }}>
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full ${agentProfile.color} flex items-center justify-center`}>
            <span className="text-sm font-medium">{agentProfile.type.toUpperCase()}</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: '#35495E' }}>{agentProfile.name}</h2>
            <div className="text-xs" style={{ color: '#6B7280' }}>
              Active since {formatTimestamp(agentMemory.created_at)} • Last updated {formatTimestamp(agentMemory.last_updated)}
            </div>
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg transition-colors"
            style={{ 
              background: 'rgba(65, 184, 131, 0.05)',
              color: '#35495E'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(65, 184, 131, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(65, 184, 131, 0.05)';
            }}
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Quick Stats - Compact Overview */}
      <div className="px-6 py-3 border-b" style={{ background: 'rgba(65, 184, 131, 0.02)', borderColor: 'rgba(65, 184, 131, 0.1)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center text-sm">
            <div className="text-center">
              <div className="font-semibold" style={{ color: '#3490DC' }}>
                {agentMemory.interactions?.length || 0}
              </div>
              <div className="text-xs" style={{ color: '#6B7280' }}>Interactions</div>
            </div>
            <div className="text-center">
              <div className="font-semibold" style={{ color: '#41B883' }}>
                {agentMemory.situation_tracking?.successful_interactions?.length || 0}
              </div>
              <div className="text-xs" style={{ color: '#6B7280' }}>Success</div>
            </div>
            <div className="text-center">
              <div className="font-semibold" style={{ color: '#F59E0B' }}>
                {agentMemory.termination_conditions?.current_counts?.debug_cycles || 
                 agentMemory.termination_conditions?.current_counts?.code_generations || 
                 agentMemory.termination_conditions?.current_counts?.question_rounds || 0}
              </div>
              <div className="text-xs" style={{ color: '#6B7280' }}>Cycles</div>
            </div>
            <div className="text-center">
              <div className="font-semibold" style={{ color: '#6574CD' }}>
                {(agentMemory.situation_tracking?.task_completion?.completed_requirements?.length || 0) +
                 (agentMemory.situation_tracking?.task_completion?.pending_requirements?.length || 0) +
                 (agentMemory.situation_tracking?.task_completion?.blocked_requirements?.length || 0)}
              </div>
              <div className="text-xs" style={{ color: '#6B7280' }}>Tasks</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="max-w-2xl mx-auto space-y-6 py-4">
        {/* Current Focus */}
        {agentMemory.user_intent_observations?.progress_markers?.current_focus && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#35495E' }}>Current Focus</h3>
            <div className="p-3 rounded-lg text-sm" style={{ 
              background: 'rgba(52, 144, 220, 0.05)',
              color: '#35495E'
            }}>
              {agentMemory.user_intent_observations.progress_markers.current_focus}
            </div>
          </div>
        )}

        {/* Active Goals */}
        {agentMemory.user_intent_observations?.stated_goals?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#35495E' }}>Active Goals</h3>
            <div className="space-y-2">
              {agentMemory.user_intent_observations.stated_goals.slice(0, 2).map((goal: string, idx: number) => (
                <div key={idx} className="flex items-start space-x-3 p-2 rounded" style={{ background: 'rgba(65, 184, 131, 0.02)' }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: '#41B883' }}></span>
                  <span className="text-sm" style={{ color: '#35495E' }}>{goal}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learned Preferences */}
        {agentMemory.learned_patterns?.user_preferences && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#35495E' }}>Learned Preferences</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              {agentMemory.learned_patterns.user_preferences.preferred_libraries?.slice(0, 4).map((lib: string, idx: number) => (
                <span key={idx} className="px-2 py-1 rounded" style={{
                  background: 'rgba(65, 184, 131, 0.1)',
                  color: '#41B883'
                }}>
                  {lib}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {agentMemory.interactions?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#35495E' }}>Recent Activity</h3>
            <div className="space-y-2">
              {agentMemory.interactions.slice(0, 2).map((interaction: any, idx: number) => (
                <div key={idx} className="p-3 rounded-lg" style={{ background: 'rgba(65, 184, 131, 0.02)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusBadge(interaction.outcome)}`}>
                      {interaction.outcome}
                    </span>
                    <span className="text-xs" style={{ color: '#6B7280' }}>
                      {new Date(interaction.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: '#35495E' }}>
                    {interaction.user_input?.slice(0, 100)}{interaction.user_input?.length > 100 && '...'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task Status */}
        {agentMemory.situation_tracking?.task_completion && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#35495E' }}>Task Status</h3>
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(65, 184, 131, 0.02)' }}>
              {agentMemory.situation_tracking.task_completion.completed_requirements?.length > 0 && (
                <div className="text-center">
                  <div className="text-sm font-semibold" style={{ color: '#41B883' }}>
                    {agentMemory.situation_tracking.task_completion.completed_requirements.length}
                  </div>
                  <div className="text-xs" style={{ color: '#6B7280' }}>Done</div>
                </div>
              )}
              {agentMemory.situation_tracking.task_completion.pending_requirements?.length > 0 && (
                <div className="text-center">
                  <div className="text-sm font-semibold" style={{ color: '#F59E0B' }}>
                    {agentMemory.situation_tracking.task_completion.pending_requirements.length}
                  </div>
                  <div className="text-xs" style={{ color: '#6B7280' }}>Pending</div>
                </div>
              )}
              {agentMemory.situation_tracking.task_completion.blocked_requirements?.length > 0 && (
                <div className="text-center">
                  <div className="text-sm font-semibold" style={{ color: '#EF4444' }}>
                    {agentMemory.situation_tracking.task_completion.blocked_requirements.length}
                  </div>
                  <div className="text-xs" style={{ color: '#6B7280' }}>Blocked</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage Limits */}
        {agentMemory.termination_conditions && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: '#35495E' }}>Usage Status</h3>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(52, 144, 220, 0.02)' }}>
              <div className="flex justify-between items-center text-xs">
                <span style={{ color: '#35495E' }}>Current / Max Cycles</span>
                <div>
                  <span className="font-medium" style={{ color: '#3490DC' }}>
                    {agentMemory.termination_conditions.current_counts?.debug_cycles || 
                     agentMemory.termination_conditions.current_counts?.code_generations || 
                     agentMemory.termination_conditions.current_counts?.question_rounds || 0}
                  </span>
                  <span style={{ color: '#6B7280' }}> / </span>
                  <span style={{ color: '#6B7280' }}>
                    {agentProfile.maxIterations.debug_cycles || 
                     agentProfile.maxIterations.code_generations || 
                     agentProfile.maxIterations.question_rounds || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default AgentDetail;