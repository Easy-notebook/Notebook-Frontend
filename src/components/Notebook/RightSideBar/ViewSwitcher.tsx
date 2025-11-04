import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleX, Clock, List, Bug, MessageCircle as LucideMessageCircle } from 'lucide-react';
import useStore from '../../../store/notebookStore';
import { useAIAgentStore } from '../../../store/AIAgentStore';

type ViewTypeExtended = 'script' | 'qa' | 'debug';

const ViewSwitcher: React.FC = () => {
  const { activeView, setActiveView } = useAIAgentStore();
  const { setIsRightSidebarCollapsed } = useStore();
  const { t } = useTranslation();

  return (
    <div className="flex gap-2 text-lg items-center w-full justify-between">
      <div className="flex gap-1 flex-1 min-w-0">
        {(['script', 'qa', 'debug'] as ViewTypeExtended[]).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view as any)}
            className={`
              px-2 py-2 rounded-md transition-all duration-300 flex items-center gap-1.5
              flex-shrink-0 min-w-0
              ${activeView === view
                ? 'bg-white text-theme-800 font-semibold'
                : 'text-gray-600 hover:bg-white/10'
              }
            `}
          >
            {view === 'script' ? (
              <Clock className="w-5 h-5 flex-shrink-0" />
            ) : view === 'qa' ? (
              <LucideMessageCircle className="w-5 h-5 flex-shrink-0" />
            ) : view === 'debug' ? (
              <Bug className="w-5 h-5 flex-shrink-0" />
            ) : (
              <List className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="hidden sm:inline whitespace-nowrap overflow-hidden text-ellipsis">
              {view === 'script' ? t('rightSideBar.history') : 
                view === 'qa' ? t('rightSideBar.chat') : 
                view === 'debug' ? 'Debug' :
                t('rightSideBar.workflow')}
            </span>
          </button>
        ))}
      </div>
      <button
        className="p-2 hover:bg-white/10 rounded-lg flex-shrink-0"
        onClick={() => setIsRightSidebarCollapsed(false)}
      >
        <CircleX className="w-5 h-5 text-gray-700" />
      </button>
    </div>
  );
};

export default ViewSwitcher;


