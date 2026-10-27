// LibraryStateHeader.tsx (moved to ui/layout/headers)
// Header component for Library state - includes import functionality
import { BarChartHorizontalBig } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

interface EmptyStateHeaderProps {
  onToggleRightSidebar: () => void;
}

const LibraryStateHeader: React.FC<EmptyStateHeaderProps> = ({ onToggleRightSidebar }) => {
  return (
    <div className="w-full h-full flex items-center justify-end px-2">
      <div className="flex items-center gap-2">
        <NotificationCenter />
        <button
          onClick={onToggleRightSidebar}
          aria-label="Toggle right sidebar"
          className="app-chrome-button"
        >
          <BarChartHorizontalBig className="app-navigation-icon" />
        </button>
      </div>
    </div>
  );
};

LibraryStateHeader.displayName = 'LibraryStateHeader';

export default LibraryStateHeader;
