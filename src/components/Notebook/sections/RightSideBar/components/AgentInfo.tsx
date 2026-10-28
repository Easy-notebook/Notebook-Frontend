import { AgentAvatar } from '../../../../AgentVisuals/shared';
// moved to sections/RightSideBar/components
import React from 'react';
import { Bot, Image, Video, Command, Brain } from 'lucide-react';

export interface AgentInfoProps {
  agent?: string;
  model?: string;
  type?: string;
}

const AgentInfo: React.FC<AgentInfoProps> = ({ agent, model, type }) => {
  const getAgentIcon = (agentType?: string) => {
    switch (agentType) {
      case 'general':
        return <Bot className="w-4 h-4 text-theme-600" />;
      case 'text2image':
        return <Image className="w-4 h-4 text-purple-600" />;
      case 'text2video':
        return <Video className="w-4 h-4 text-indigo-600" />;
      case 'command':
        return <Command className="w-4 h-4 text-green-600" />;
      default:
        return <Brain className="w-4 h-4 text-orange-600" />;
    }
  };

  const getAgentName = (agentType?: string) => {
    const names: Record<string, string> = {
      general: 'General Assistant',
      text2image: 'Image Generator',
      text2video: 'Video Generator',
      command: 'Code Assistant',
    };
    return names[agentType || ''] || agent || 'AI Assistant';
  };

  if (!agent && !type) return null;

  return (
    <div className="av-theme av-card-top px-2 py-2">
      <AgentAvatar name={getAgentName(type || agent)} avatar={getAgentIcon(type || agent)} />
      <div className="av-identity">
        <span className="text-xs font-medium">{getAgentName(type || agent)}</span>
        {model && <span className="av-muted">{model}</span>}
      </div>
    </div>
  );
};

export default AgentInfo;
