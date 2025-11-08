import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Bug, MessageCircle as LucideMessageCircle } from 'lucide-react';
import { useAIAgentStore } from '@Store/AIAgentStore';

type ViewTypeExtended = 'script' | 'qa' | 'debug';

const ViewSwitcher: React.FC = () => {
  const { activeView, setActiveView } = useAIAgentStore();
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center w-full gap-3">
      {(['script', 'qa', 'debug'] as ViewTypeExtended[]).map((view) => {
        const isActive = activeView === view;

        return (
          <button
            key={view}
            onClick={() => setActiveView(view as any)}
            className={`
              px-4 py-2 rounded-xl
              flex items-center gap-2
              transition-all duration-200
              ${
                isActive
                  ? 'border-2 border-primary text-white font-medium'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-300'
              }
            `}
          >
            {view === 'script' ? (
              <Clock className="w-5 h-5 flex-shrink-0" />
            ) : view === 'qa' ? (
              <LucideMessageCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Bug className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="hidden sm:inline whitespace-nowrap">
              {view === 'script'
                ? t('rightSideBar.history')
                : view === 'qa'
                  ? t('rightSideBar.chat')
                  : 'Debug'}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ViewSwitcher;
