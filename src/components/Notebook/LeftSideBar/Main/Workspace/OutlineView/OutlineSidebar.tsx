import { useState, useCallback, memo, useMemo, useEffect } from 'react';
import useStore from '@Store/notebookStore';
import useSettingsStore from '@Store/settingsStore';
import { navigateToLibrary, navigateToHome } from '@/utils/navigation';
import useRouteStore from '@Store/routeStore';
import FileTree from '@LeftSidebar/Main/Workspace/FileExplorer/FileExplorer';
import AgentList from '@LeftSidebar/Main/Workspace/Agents/AgentList';
import { AgentType } from '@Services/agentMemoryService';

// 导入拆分后的组件
import { PhaseSection } from './PhaseSection';
import MiniSidebar from '@LeftSidebar/Mini/MiniSidebar';

// 导入共享组件
import {
  StatusDot,
  TabSwitcher,
  SidebarContainer,
  SidebarHeader,
  SidebarContent
} from '@LeftSidebar/shared/components';


interface OutlineSidebarProps {
  tasks: Array<{
    id: string;
    title: string;
    phases: Array<{
      id: string;
      title: string;
      icon: string;
      steps: Array<{ id: string; title: string }>;
    }>;
  }>;
  currentPhaseId: string;
  currentStepId: string;
  onPhaseSelect: (phaseId: string, stepId: string) => void;
  viewMode: string;
  onAgentSelect?: (agentType: AgentType) => void;
}

const OutlineSidebar = ({
  tasks,
  currentPhaseId,
  currentStepId,
  onPhaseSelect,
  viewMode,
  onAgentSelect,
}: OutlineSidebarProps) => {

  const isCollapsed = useStore((state) => state.isCollapsed);
  const setIsCollapsed = useStore((state) => state.setIsCollapsed);
  const settingstore = useSettingsStore();
  const { currentRoute, currentView } = useRouteStore();
  const notebookId = useStore((state) => state.notebookId);

  // Calculate active sidebar item based on current route
  const getActiveItemId = useCallback(() => {
    if (settingstore.settingsOpen) {
      return 'settings';
    }
    
    switch (currentView) {
      case 'empty':
        return 'new-notebook';
      case 'library':
        return 'knowledge-forest';
      case 'workspace':
        return 'workspace';
      default:
        if (currentRoute === '/') {
          return 'new-notebook';
        } else if (currentRoute === '/FoKn/Library') {
          return 'knowledge-forest';
        } else if (currentRoute.startsWith('/workspace/')) {
          return 'workspace';
        }
        return 'workspace'; // Default for workspace view
    }
  }, [currentView, currentRoute, settingstore.settingsOpen]);
  const [activeTab, setActiveTab] = useState<'file' | 'outline' | 'agents'>('outline');
  const [isHovered, setIsHovered] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<AgentType | null>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    tasks.forEach(task => {
      task.phases.forEach(phase => {
        initialState[phase.id] = phase.id === currentPhaseId;
      });
    });
    return initialState;
  });

  const currentTask = useMemo(() => {
    if (!currentPhaseId) return null;
    return tasks.find(task =>
      task.phases.some(phase => phase.id === currentPhaseId)
    );
  }, [tasks, currentPhaseId]);

  const projectName = currentTask?.title || (tasks && tasks.length > 0 ? tasks[0].title : '');

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [setIsCollapsed, isCollapsed]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  const handlePhaseClick = useCallback((phaseId: string | null) => {
    if (phaseId === null) {
      toggleCollapse();
      return;
    }
    const phase = tasks.flatMap(task => task.phases).find(p => p.id === phaseId);
    if (phase && phase.steps.length > 0) {
      onPhaseSelect(phaseId, phase.steps[0].id);
      setExpandedSections(prev => ({
        ...prev,
        [phaseId]: true
      }));
    }
  }, [toggleCollapse, onPhaseSelect, tasks]);

  const handleAgentSelect = useCallback((agentType: AgentType) => {
    setSelectedAgentType(agentType);
    onAgentSelect?.(agentType);
  }, [onAgentSelect]);

  const allPhases = useMemo(() => tasks.flatMap(task => task.phases), [tasks]);

  const renderBottomSection = useCallback(() => {
    if (viewMode === 'step' && currentPhaseId) {
      const currentPhase = allPhases.find(p => p.id === currentPhaseId);
      return (
        <div className="w-full h-20 pl-7 flex items-center border-t border-gray-200 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
          <StatusDot status="in-progress" />
          <span className="font-medium tracking-wide text-theme-800 relative text-base ml-4">
            {currentPhase?.title || ''}
          </span>
        </div>
      );
    }

    if (activeTab === 'file' && isHovered) {
      return (
        <div className="w-full h-10 pl-7 flex items-center justify-start border-t border-gray-200 relative">
          <span className="font-medium tracking-wide text-theme-800 relative text-base truncate overflow-hidden whitespace-nowrap">
            Drop files to upload
          </span>
        </div>
      );
    }

    return <div className="w-full h-10" />;
  }, [viewMode, currentPhaseId, allPhases, activeTab, isHovered]);

  useEffect(() => {
    if (currentStepId) {
      const allPhasesFlat = tasks.flatMap(task => task.phases);
      const phaseOfcurrentStep = allPhasesFlat.find(phase =>
        phase.steps.some(step => step.id === currentStepId)
      );
      if (phaseOfcurrentStep) {
        setExpandedSections(prev => ({
          ...prev,
          [phaseOfcurrentStep.id]: true
        }));
      }
    }
  }, [currentStepId, tasks]);

  if (isCollapsed) {
    return (
      <MiniSidebar
        phases={allPhases}
        currentPhaseId={currentPhaseId}
        onPhaseClick={handlePhaseClick}
        onItemClick={(itemId) => {
          if (itemId === 'library') setActiveTab('file');
          else if (itemId === 'knowledge-forest') navigateToLibrary();
          else if (itemId === 'tools') setActiveTab('outline');
          else if (itemId === 'settings') settingstore.openSettings();
          else if (itemId === 'new-notebook') {
            useStore.getState().setNotebookId(null);
            setActiveTab('outline'); // 重置到默认 tab
            navigateToHome();
          }
        }}
        activeItemId={getActiveItemId()}
        onExpandClick={toggleCollapse}
        isMainSidebarExpanded={false}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* 主侧边栏 - 填充剩余空间 */}
      <div className="flex-1">
        <SidebarContainer
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 简化的头部区域：只显示 Tab 切换 + 设置按钮 */}
          <SidebarHeader>
            <div className="flex items-center bg-white align-center w-full justify-center flex-col">
              {/* Tab 切换器 */}
              <TabSwitcher
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          </SidebarHeader>

          {/* 中间内容：根据 activeTab 切换显示 */}
          <SidebarContent>
            {activeTab === 'file' ? (
              // 文件视图：使用 FileTree 组件，简化容器支持换行
              <div className="py-0">
                <FileTree notebookId={notebookId || ''} projectName={projectName} />
              </div>
            ) : activeTab === 'agents' ? (
              // Agent视图：显示AI代理列表，简化容器支持换行
              <div className="py-0">
                <AgentList
                  isCollapsed={false}
                  onAgentSelect={handleAgentSelect}
                  selectedAgentType={selectedAgentType}
                />
              </div>
            ) : (
              // 大纲视图：显示任务和阶段
              <div className="py-0.5">
                {tasks.map((task) => (
                  <div key={task.id} className="mb-5">
                    {task.phases.map((phase, index) => (
                      <PhaseSection
                        key={phase.id}
                        isTitle={index === 0}
                        phase={phase}
                        isExpanded={expandedSections[phase.id]}
                        onToggle={() => toggleSection(phase.id)}
                        onStepSelect={onPhaseSelect}
                        isActive={currentPhaseId === phase.id}
                        currentStepId={currentStepId}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </SidebarContent>

          {/* 底部区域 */}
          {renderBottomSection()}
        </SidebarContainer>
      </div>
    </div>
  );
};

export default memo(OutlineSidebar);