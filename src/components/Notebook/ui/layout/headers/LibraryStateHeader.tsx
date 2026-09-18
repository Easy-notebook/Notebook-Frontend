// LibraryStateHeader.tsx (moved to ui/layout/headers)
// Header component for Library state - includes import functionality
import { BarChartHorizontalBig } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

interface EmptyStateHeaderProps {
  onToggleRightSidebar: () => void;
}

const LibraryStateHeader: React.FC<EmptyStateHeaderProps> = ({ onToggleRightSidebar }) => {
  return (
    <div className="w-full h-18 mt-4 flex items-center justify-end px-4">
      <div className="flex items-center gap-2">
        <NotificationCenter />
        <button
          onClick={onToggleRightSidebar}
          className="flex items-center gap-2 p-2 rounded-lg transition-all duration-200 hover:scale-105 text-primary bg-primary/10 hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20"
        >
          <BarChartHorizontalBig size={18} />
        </button>
      </div>
    </div>
  );
};

LibraryStateHeader.displayName = 'LibraryStateHeader';

export default LibraryStateHeader;
