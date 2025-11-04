import React from 'react';
import { TreePine, Leaf, Sprout } from 'lucide-react';

const KnowledgeTrees: React.FC = () => {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TreePine className="w-4 h-4 text-green-600" />
        <h3 className="font-medium text-sm text-gray-800">Knowledge Trees</h3>
      </div>
      
      <div className="space-y-2 text-sm text-gray-500">
        <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
          <TreePine className="w-3 h-3 text-green-600" />
          <span>Machine Learning</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
          <Leaf className="w-3 h-3 text-green-500" />
          <span>Data Science</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
          <Sprout className="w-3 h-3 text-green-400" />
          <span>Growing Seeds</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeTrees;