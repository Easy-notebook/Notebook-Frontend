import React from 'react';
import { extractSectionTitle } from '@Notebook/utils/String';

const WorkflowVisualization: React.FC<{ className?: string }> = ({ className = '' }) => {
  // Placeholder visualization (migrated from MainContainer)
  return (
    <div className={className}>
      <div className="text-sm text-gray-500">Workflow Visualization (migrated)</div>
    </div>
  );
};

export default WorkflowVisualization;
