// moved to sections/LeftSideBar/Main/Workspace/OutlineView
import { useState, useCallback, memo, useMemo, useEffect } from 'react';
import useStore from '@Store/notebookStore';
import FileTree from '@LeftSidebar/Main/Workspace/FileExplorer/FileExplorer';
import AgentList from '@LeftSidebar/Main/Workspace/Agents/AgentList';
import { AgentType } from '@Services/agentMemoryService';
import usePreviewStore from '@Store/previewStore';

// 导入拆分后的组件
import { PhaseSection } from './PhaseSection';

// 导入共享组件
import {
  StatusDot,
  TabSwitcher,
  SidebarContainer,
  SidebarHeader,
  SidebarContent,
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
  const notebookId = useStore((state) => state.notebookId);
  const previewMode = usePreviewStore((s) => s.previewMode);

  const [activeTab, setActiveTab] = useState<'file' | 'outline' | 'agents'>(
    previewMode === 'file' ? 'file' : 'outline'
  );
  const [isHovered, setIsHovered] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<AgentType | null>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    tasks.forEach((task) => {
      task.phases.forEach((phase) => {
        initialState[phase.id] = true;
      });
    });
    return initialState;
  });

  const currentTask = useMemo(() => {
    if (!currentPhaseId) return null;
    return tasks.find((task) => task.phases.some((phase) => phase.id === currentPhaseId));
  }, [tasks, currentPhaseId]);

  const projectName = currentTask?.title || (tasks && tasks.length > 0 ? tasks[0].title : '');

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const handleAgentSelect = useCallback(
    (agentType: AgentType) => {
      setSelectedAgentType(agentType);
      onAgentSelect?.(agentType);
    },
    [onAgentSelect]
  );

  const allPhases = useMemo(() => tasks.flatMap((task) => task.phases), [tasks]);

  const renderBottomSection = useCallback(() => {
    if (viewMode === 'step' && currentPhaseId) {
      const currentPhase = allPhases.find((p) => p.id === currentPhaseId);
      return (
        <div className="w-full h-20 pl-7 flex items-center relative">
          <div className="absolute inset-0" />
          <StatusDot status="in-progress" />
          <span className="font-medium tracking-wide text-theme-800 dark:!text-white relative text-base ml-4">
            {currentPhase?.title || ''}
          </span>
        </div>
      );
    }

    if (activeTab === 'file' && isHovered) {
      return (
        <div className="w-full h-10 pl-7 flex items-center justify-start relative">
          <span className="font-medium tracking-wide text-theme-800 dark:!text-gray-300 relative text-base truncate overflow-hidden whitespace-nowrap">
            Drop files to upload
          </span>
        </div>
      );
    }

    return <div className="w-full h-10" />;
  }, [viewMode, currentPhaseId, allPhases, activeTab, isHovered]);

  useEffect(() => {
    if (currentStepId) {
      const allPhasesFlat = tasks.flatMap((task) => task.phases);
      const phaseOfcurrentStep = allPhasesFlat.find((phase) =>
        phase.steps.some((step) => step.id === currentStepId)
      );
      if (phaseOfcurrentStep) {
        setExpandedSections((prev) => ({
          ...prev,
          [phaseOfcurrentStep.id]: true,
        }));
      }
    }
  }, [currentStepId, tasks]);

  // Keep tab selection aligned with preview mode
  useEffect(() => {
    if (previewMode === 'file') setActiveTab('file');
  }, [previewMode]);

  // Handle tab change and keep preview mode in sync
  const handleTabChange = useCallback((tab: 'file' | 'outline' | 'agents') => {
    setActiveTab(tab);
    const ps: any = usePreviewStore.getState();
    if (tab === 'file') {
      if (ps?.previewMode !== 'file' && typeof ps?.changePreviewMode === 'function') {
        ps.changePreviewMode();
      }
    } else {
      if (ps?.previewMode !== 'notebook' && typeof ps?.resetToNotebookMode === 'function') {
        ps.resetToNotebookMode();
      }
    }
  }, []);
  return (
    <SidebarContainer
      className="flex-1 h-full min-h-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 简化的头部区域：只显示 Tab 切换 + 设置按钮 */}
      <SidebarHeader>
        <div className="flex items-center bg-transparent dark:bg-transparent align-center w-full justify-center flex-col">
          {/* Tab 切换器 */}
          <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />
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
  );
};

export default memo(OutlineSidebar);
