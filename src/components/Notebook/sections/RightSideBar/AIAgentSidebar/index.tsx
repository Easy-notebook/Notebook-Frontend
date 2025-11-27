// moved to sections/RightSideBar
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import useStore, { NotebookStore } from '@Store/notebookStore';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { EVENT_TYPES, type QAItem } from '@Store/models/agent';
import ViewSwitcher from '@RightSidebar/components/ViewSwitcher';

import WorkflowVisualization from '@Notebook/features/workflow/WorkflowVisualization';
import ActionCard from './components/ActionCard';
import QACard from './components/QACard';
import { MergedAction } from './types';

// ----------------------
// Type Definitions
// ----------------------

const AIAgentSidebar = () => {
  const { activeView, isLoading, actions, qaList, setActiveView } = useAIAgentStore();
  // 追踪哪些合并组是展开状态
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { t } = useTranslation();

  // Use shallow comparison for currentStepCellsIDs to avoid unnecessary re-renders
  const currentStepCellsIDs = useStore(
    useShallow((state: NotebookStore) => state.getCurrentStepCellsIDs())
  );

  // Also getting currentPhaseId and currentStepIndex to ensure updates on navigation
  const { viewMode, currentPhaseId, currentStepIndex } = useStore(
    useShallow((state: NotebookStore) => ({
      viewMode: state.viewMode,
      currentPhaseId: state.currentPhaseId,
      currentStepIndex: state.currentStepIndex,
    }))
  );

  const actionsToShow = useMemo(() => {
    return actions.filter(
      (action) =>
        (viewMode &&
          action.viewMode === viewMode &&
          viewMode === 'step' &&
          currentStepCellsIDs.includes(action.cellId ?? '')) ||
        (viewMode &&
          action.viewMode === viewMode &&
          (viewMode === 'complete' || viewMode === 'create')) ||
        (viewMode && action.viewMode === viewMode && viewMode === 'dslc')
    );
  }, [actions, viewMode, currentStepCellsIDs, currentPhaseId, currentStepIndex]);

  // 合并连续相同类型的actions
  const mergedActionsToShow = useMemo(() => {
    if (actionsToShow.length === 0) return [];

    const mergedActions: MergedAction[] = [];
    let currentGroup: MergedAction = {
      ...actionsToShow[0],
      count: 1,
      originalActions: [actionsToShow[0]],
    };

    for (let i = 1; i < actionsToShow.length; i++) {
      const currentAction = actionsToShow[i];
      const prevAction = actionsToShow[i - 1];

      // 用户问题不合并，每个都单独显示
      const isUserQuestion = currentAction.type === EVENT_TYPES.USER_ASK_QUESTION;

      // 如果当前action与上一个action类型相同，且不是用户问题，才合并它们
      if (currentAction.type === prevAction.type && !isUserQuestion) {
        currentGroup.count += 1;
        currentGroup.originalActions.push(currentAction);

        // 如果有任何一个正在处理中，则整组标记为处理中
        if (currentAction.onProcess) {
          currentGroup.onProcess = true;
        }

        // 合并关联的QA IDs (这个仍然需要合并)
        if (currentAction.relatedQAIds?.length) {
          currentGroup.relatedQAIds = [
            ...(currentGroup.relatedQAIds || []),
            ...(currentAction.relatedQAIds || []),
          ];
        }
      } else {
        // 类型不同，或者是用户问题，将当前组添加到结果中并开始新组
        mergedActions.push(currentGroup);
        currentGroup = {
          ...currentAction,
          count: 1,
          originalActions: [currentAction],
        };
      }
    }

    // 添加最后一组
    mergedActions.push(currentGroup);
    return mergedActions;
  }, [actionsToShow]);

  // 处理展开/折叠逻辑
  const toggleGroup = useCallback((actionId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [actionId]: !prev[actionId],
    }));
  }, []);

  const qasToShow = useMemo(() => {
    const filtered = qaList.filter((qa: QAItem) => {
      // 如果QA没有viewMode，说明是旧数据，显示在所有模式下
      if (!qa.viewMode) {
        return true;
      }

      // 匹配当前视图模式
      if (qa.viewMode !== viewMode) {
        return false;
      }

      // 如果是step模式，需要检查cell ID
      if (viewMode === 'step') {
        return currentStepCellsIDs.includes(qa.cellId || '');
      }

      // complete 和 dslc 模式显示所有匹配的QA
      return true;
    });

    return filtered;
  }, [qaList, viewMode, currentStepCellsIDs, currentPhaseId, currentStepIndex]);

  const handleJumpToQA = useCallback(
    (qaId: string) => {
      setActiveView('qa');
      requestAnimationFrame(() => {
        const qaElement = document.getElementById(qaId);
        if (qaElement) {
          qaElement.scrollIntoView({ behavior: 'smooth' });
        }
      });
    },
    [setActiveView]
  );

  // 根据 qaId 获取对应的数字编号
  const getQANumber = useCallback(
    (qaId: string) => {
      const index = qasToShow.findIndex((qa) => qa.id === qaId);
      if (index === -1) return null;
      return qasToShow.length - index;
    },
    [qasToShow]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-14 shrink-0 flex items-center justify-center px-4 border-b border-gray-200 dark:border-white/10">
        <ViewSwitcher />
      </div>

      <div className="flex-1 px-2 sm:px-4 pb-5 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent hover:scrollbar-thumb-white/50">
        <style>{`
  .scrollbar - thin:: -webkit - scrollbar { width: 4px; }
            .scrollbar - thin:: -webkit - scrollbar - track { background: transparent; }
            .scrollbar - thin:: -webkit - scrollbar - thumb { background: rgba(255, 255, 255, 0.3); border - radius: 4px; }
            .scrollbar - thin:: -webkit - scrollbar - thumb:hover { background: rgba(255, 255, 255, 0.5); }
            .scrollbar - thin { scrollbar - width: thin; scrollbar - color: rgba(255, 255, 255, 0.3) transparent; }
`}</style>

        {activeView === 'script' && (
          <div className="space-y-3 py-3">
            {mergedActionsToShow.map((action, index) => (
              <div key={action.id} className="space-y-2">
                <ActionCard
                  action={action}
                  index={index}
                  totalCount={mergedActionsToShow.length}
                  isExpanded={expandedGroups[action.id]}
                  onToggleExpand={toggleGroup}
                  onJumpToQA={handleJumpToQA}
                  getQANumber={getQANumber}
                />

                {expandedGroups[action.id] && action.count > 1 && (
                  <div className="space-y-2 mt-2 pb-2 pl-4">
                    {action.originalActions.slice(1).map((origAction, origIndex) => (
                      <ActionCard
                        key={`original - ${origAction.id} -${origIndex} `}
                        action={origAction}
                        isOriginal={true}
                        index={origIndex}
                        totalCount={action.originalActions.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeView === 'qa' && (
          <div className="space-y-4 py-4">
            {qasToShow.length === 0 ? (
              <div className="text-center py-8 text-gray-500 flex flex-col items-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm mx-auto text-gray-500">{t('rightSideBar.noChatMessages')}</p>
                <p className="text-xs mt-1 mx-auto text-gray-500">
                  {t('rightSideBar.startConversation')}
                </p>
              </div>
            ) : (
              qasToShow.map((qa, index) => (
                <QACard key={qa.id} qa={qa} index={index} totalCount={qasToShow.length} />
              ))
            )}
          </div>
        )}

        {activeView === 'workflow' && (
          <div className="py-4">
            <WorkflowVisualization />
          </div>
        )}

        {isLoading && (
          <div
            className="
                flex items-center justify-center gap-3 text-theme-700 dark:text-theme-300 p-4 my-4
                ring-1 ring-theme-300 dark:ring-theme-700 rounded-lg animate-pulse transition-all duration-300
              "
          >
            <Loader2 className="animate-spin" size={24} />
            <span className="font-medium">{t('rightSideBar.processing')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAgentSidebar;
