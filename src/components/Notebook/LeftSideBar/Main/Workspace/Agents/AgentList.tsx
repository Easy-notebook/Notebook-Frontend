import React, { useState, useEffect, memo, useCallback } from 'react';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import useStore from '@Store/notebookStore';
import {
  StatusDot,
  SidebarButton,
  RunningIndicator,
  TaskCounter
} from '@Notebook/LeftSideBar/shared/components';

interface AgentListProps {
  isCollapsed: boolean;
  onAgentSelect: (agentType: AgentType) => void;
  selectedAgentType?: AgentType | null;
  runningAgents?: Set<AgentType>; // 正在运行的agents
}

const AGENT_GROUPS = [
  {
    name: 'Basic',
    agents: [
      { type: 'general' as AgentType, icon: '🤖', title: 'General Agent' },
      { type: 'command' as AgentType, icon: '⚡', title: 'Command Agent' },
      { type: 'debug' as AgentType, icon: '🔧', title: 'Debug Agent' },
      { type: 'output' as AgentType, icon: '📊', title: 'Output Agent' }
    ]
  }
  // 未来将添加 DSLC 组
];

// 使用共享的状态样式

interface AgentItemProps {
  agent: { type: AgentType; icon: string; title: string };
  isActive: boolean;
  hasMemory: boolean;
  isRunning: boolean;
  taskCount: number;
  onClick: () => void;
}

const AgentItem = memo<AgentItemProps>(({ 
  agent,
  isActive,
  hasMemory,
  isRunning,
  taskCount,
  onClick
}) => {
  return (
    <SidebarButton
      isActive={isActive}
      onClick={onClick}
      className="text-sm tracking-wide"
      size="sm"
    >
      <StatusDot
        status={hasMemory ? 'in-progress' : 'pending'}
        size="sm"
      />

      <span className="font-normal flex-1 text-left">{agent.title}</span>

      {isRunning && <RunningIndicator />}
      {!isRunning && hasMemory && taskCount > 0 && <TaskCounter count={taskCount} />}
    </SidebarButton>
  );
});

const AgentList: React.FC<AgentListProps> = ({ 
  isCollapsed, 
  onAgentSelect, 
  selectedAgentType,
  runningAgents = new Set()
}) => {
  const { notebookId } = useStore();
  const [agentMemories, setAgentMemories] = useState<Record<AgentType, any>>({} as Record<AgentType, any>);

  useEffect(() => {
    if (!notebookId) return;

    const loadAgentMemories = () => {
      const memories: Record<AgentType, any> = {} as Record<AgentType, any>;
      
      AGENT_GROUPS.forEach(group => {
        group.agents.forEach(({ type }) => {
          const memory = AgentMemoryService.getAgentMemory(notebookId, type);
          if (memory) {
            memories[type] = memory;
          }
        });
      });
      
      setAgentMemories(memories);
    };

    loadAgentMemories();
    
    // 监听存储变化 - localStorage变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'agent_memories_v2') {
        loadAgentMemories();
      }
    };
    
    // 监听自定义事件 - 内存变化
    const handleMemoryUpdate = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      if (detail?.notebookId === notebookId) {
        loadAgentMemories();
      }
    };
    
    // 设置定时器进行轮询更新
    const pollInterval = setInterval(() => {
      loadAgentMemories();
    }, 2000); // 每2秒检查一次
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('agentMemoryUpdated', handleMemoryUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('agentMemoryUpdated', handleMemoryUpdate);
      clearInterval(pollInterval);
    };
  }, [notebookId]);

  const getAgentStats = useCallback((agentType: AgentType) => {
    const memory = agentMemories[agentType];
    if (!memory) return { interactions: 0, lastActive: null, taskCount: 0 };

    const taskCount = (memory.situation_tracking?.task_completion?.completed_requirements?.length || 0) +
                     (memory.situation_tracking?.task_completion?.pending_requirements?.length || 0) +
                     (memory.situation_tracking?.task_completion?.blocked_requirements?.length || 0);

    return {
      interactions: memory.interactions?.length || 0,
      lastActive: memory.last_updated ? new Date(memory.last_updated) : null,
      taskCount
    };
  }, [agentMemories]);

  const handleAgentClick = useCallback((agentType: AgentType) => {
    onAgentSelect(agentType);
  }, [onAgentSelect]);

  // 如果是折叠状态，不显示agents（因为没有足够空间）
  if (isCollapsed) {
    return null;
  }

  return (
    <div className="py-0.5">
      {AGENT_GROUPS.map((group) => (
        <div key={group.name} className="mb-3">
          {/* 组标题 */}
          <div className="px-2.5 mb-1">
            <h2 className="pl-2 text-base font-semibold text-theme-800">
              {group.name}
            </h2>
          </div>

          {/* 组内的agents */}
          <div className="px-2.5 space-y-0.5">
            {group.agents.map((agent) => {
              const stats = getAgentStats(agent.type);
              const isActive = selectedAgentType === agent.type;
              const hasMemory = !!agentMemories[agent.type];
              const isRunning = runningAgents.has(agent.type);
              
              return (
                <AgentItem
                  key={agent.type}
                  agent={agent}
                  isActive={isActive}
                  hasMemory={hasMemory}
                  isRunning={isRunning}
                  taskCount={stats.taskCount}
                  onClick={() => handleAgentClick(agent.type)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AgentList;