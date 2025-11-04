import React from 'react';

interface ProgressProps {
  value?: number;
  max?: number;
  className?: string;
}

const Progress: React.FC<ProgressProps> = ({ value = 0, max = 100, className = '' }) => (
  <div className={`w-full bg-gray-200 rounded-full h-2.5 ${className}`}>
    <div 
      className="bg-theme-600 h-2.5 rounded-full transition-all duration-300"
      style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
    />
  </div>
);

export default Progress;