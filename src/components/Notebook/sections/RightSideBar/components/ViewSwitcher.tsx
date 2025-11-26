// moved to sections/RightSideBar/components
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { TabSwitcherGeneric } from '@LeftSidebar/shared/components';

type ViewTypeExtended = 'script' | 'qa' | 'workflow';

// Rightbar tab switcher aligned with LeftSideBar's TabSwitcher style
const ViewSwitcher: React.FC = () => {
  const { activeView, setActiveView } = useAIAgentStore();
  const { t } = useTranslation();

  const tabs: { id: ViewTypeExtended; label: string }[] = [
    { id: 'script', label: t('rightSideBar.history') },
    { id: 'qa', label: t('rightSideBar.chat') },
    { id: 'workflow', label: t('rightSideBar.workflow') },
  ];

  return (
    <div className="flex items-center justify-center w-full">
      <TabSwitcherGeneric
        items={tabs}
        activeId={activeView as ViewTypeExtended}
        onChange={(id) => setActiveView(id as any)}
      />
    </div>
  );
};

export default ViewSwitcher;
