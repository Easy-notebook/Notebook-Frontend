import React from 'react';
import { Bot, FileText, Users } from 'lucide-react';

interface WorkspaceAgentsProps {
  workspaceId: string;
}

const WorkspaceAgents: React.FC<WorkspaceAgentsProps> = ({ workspaceId }) => {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4 text-theme-600" />
        <h3 className="font-medium text-sm text-gray-800">Workspace Agents</h3>
      </div>
      
      <div className="space-y-2 text-sm text-gray-500">
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <FileText className="w-3 h-3" />
          <span>Document Assistant</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <Users className="w-3 h-3" />
          <span>Workflow Helper</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceAgents;