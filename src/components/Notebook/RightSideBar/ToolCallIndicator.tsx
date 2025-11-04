import React from 'react';
import { Image, Video, Code, Brain, PlayCircle, Users, Settings, Zap, Bot } from 'lucide-react';

export interface ToolCallProps {
  type: string;
  content?: string;
  agent?: string;
}

const ToolCallIndicator: React.FC<ToolCallProps> = ({ type, content, agent }) => {
  const getToolIcon = (toolType: string) => {
    switch (toolType.toLowerCase()) {
      case 'draw-image':
      case 'trigger_image_generation':
        return <Image className="w-4 h-4 text-purple-600" />;
      case 'create-video':
        return <Video className="w-4 h-4 text-indigo-600" />;
      case 'add-code':
      case 'exec-code':
        return <Code className="w-4 h-4 text-green-600" />;
      case 'thinking':
        return <Brain className="w-4 h-4 text-orange-600" />;
      case 'call-execute':
        return <PlayCircle className="w-4 h-4 text-theme-600" />;
      case 'communicate':
        return <Users className="w-4 h-4 text-teal-600" />;
      case 'remember':
        return <Settings className="w-4 h-4 text-gray-600" />;
      default:
        return <Zap className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getToolLabel = (toolType: string) => {
    const labels: Record<string, string> = {
      'draw-image': '🎨 Image Generation',
      'trigger_image_generation': '🎨 Image Generation',
      'create-video': '🎬 Video Creation',
      'add-code': '💻 Code Writing',
      'exec-code': '▶️ Code Execution',
      'thinking': '🤔 Reasoning',
      'call-execute': '⚡ Execute',
      'communicate': '💬 Agent Communication',
      'remember': '💾 Memory Update',
      'update-title': '📝 Update Title',
      'new-chapter': '📚 New Chapter',
      'new-section': '📄 New Section',
    };
    return labels[toolType] || `🔧 ${toolType}`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-theme-50 to-purple-50 rounded-lg border border-theme-100">
      <div className="flex items-center gap-1">
        {getToolIcon(type)}
        <span className="text-sm font-medium text-gray-700">
          {getToolLabel(type)}
        </span>
      </div>
      {agent && (
        <div className="flex items-center gap-1 px-2 py-1 bg-white/70 rounded-md">
          <Bot className="w-3 h-3 text-theme-500" />
          <span className="text-xs text-theme-600 font-medium">{agent}</span>
        </div>
      )}
      {content && content.length > 50 && (
        <span className="text-xs text-gray-500 truncate max-w-32">
          {content.substring(0, 50)}...
        </span>
      )}
    </div>
  );
};

export default ToolCallIndicator;


