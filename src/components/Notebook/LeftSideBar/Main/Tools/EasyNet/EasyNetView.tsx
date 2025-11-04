import React from 'react';
import { Network, Cpu, Zap } from 'lucide-react';

const EasyNetView: React.FC = () => {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network className="w-4 h-4 text-theme-600" />
        <h3 className="font-medium text-sm text-gray-800">EasyNet</h3>
      </div>
      
      <div className="space-y-2 text-sm text-gray-500">
        <div className="flex items-center gap-2 p-2 bg-theme-50 rounded">
          <Cpu className="w-3 h-3 text-theme-600" />
          <span>Compute Nodes</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-theme-50 rounded">
          <Zap className="w-3 h-3 text-yellow-600" />
          <span>Behavior Packages</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="text-xs text-gray-400 mt-3 p-2 bg-gray-50 rounded">
          Distributed computing and behavior execution platform
        </div>
      </div>
    </div>
  );
};

export default EasyNetView;