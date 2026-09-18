import React from 'react';
import { Layout, Code, Monitor } from 'lucide-react';
import { DISPLAY_MODES } from '@Store/codeStore';

export interface DisplayModeButtonProps {
  cellMode: string;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Button to toggle cell display mode (Complete/Code Only/Output Only)
 */
export const DisplayModeButton: React.FC<DisplayModeButtonProps> = ({
  cellMode,
  onToggle,
  disabled = false,
}) => {
  let icon;
  let title;

  switch (cellMode) {
    case DISPLAY_MODES.COMPLETE:
      icon = <Layout className="w-4 h-4" />;
      title = 'Create Mode';
      break;
    case DISPLAY_MODES.CODE_ONLY:
      icon = <Code className="w-4 h-4" />;
      title = 'Code Only';
      break;
    case DISPLAY_MODES.OUTPUT_ONLY:
      icon = <Monitor className="w-4 h-4" />;
      title = 'Output Only';
      break;
    default:
      icon = <Layout className="w-4 h-4" />;
      title = 'Create Mode';
  }

  return (
    <button
      onClick={onToggle}
      className="p-2 hover:bg-gray-200 rounded"
      disabled={disabled}
      title={disabled ? 'Mode switching disabled' : title}
    >
      {icon}
    </button>
  );
};
