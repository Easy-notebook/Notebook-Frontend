// moved to sections/LeftSideBar/Main/KnowledgeForest/Trees
import React from 'react';
import { TreePine } from 'lucide-react';

const KnowledgeTrees: React.FC = () => {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TreePine className="w-4 h-4 text-green-600" />
        <h3 className="font-medium text-sm text-gray-800">Knowledge Trees</h3>
      </div>

      <div className="space-y-2 text-sm text-gray-500">
        {/* Knowledge trees will be displayed here when implemented */}
      </div>
    </div>
  );
};

export default KnowledgeTrees;
