import React from 'react';
import { Folder, Star, Clock } from 'lucide-react';

const ProjectList: React.FC = () => {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Folder className="w-4 h-4 text-theme-600" />
        <h3 className="font-medium text-sm text-gray-800">Project Library</h3>
      </div>
      
      <div className="space-y-2 text-sm text-gray-500">
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <Star className="w-3 h-3 text-yellow-500" />
          <span>Starred Projects</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <Clock className="w-3 h-3 text-theme-500" />
          <span>Recent Projects</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <Folder className="w-3 h-3 text-gray-500" />
          <span>All Projects</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectList;