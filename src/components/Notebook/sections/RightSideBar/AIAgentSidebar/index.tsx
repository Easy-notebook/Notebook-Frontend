// moved to sections/RightSideBar
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Layers, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';

import useStore from '@Store/notebookStore';
import { useAIAgentStore, EVENT_TYPES } from '@Store/AIAgentStore';
import StateMachineDebugger from '@RightSidebar/debug/StateMachineDebugger';
import AIPlanningContextDebugger from '@RightSidebar/debug/AIPlanningContextDebugger';
import WorkflowTODOPanel from '@RightSidebar/workflow/WorkflowTODOPanel';
import ViewSwitcher from '@RightSidebar/components/ViewSwitcher';
import ToolCallIndicator from '@RightSidebar/components/ToolCallIndicator';
import ExpandableText from '@RightSidebar/components/ExpandableText';
import EventIcon from '@RightSidebar/components/EventIcon';
import { getEventLabel } from '@RightSidebar/utils/eventUtils';
import SpotlightCard from '@/components/UI/card/SpotlightCard';
import WorkflowVisualization from '@Notebook/features/workflow/WorkflowVisualization';

// ----------------------
// Type Definitions
// ----------------------

const AIAgentSidebar = () => {
  const { activeView, isLoading, actions, qaList, setActiveView } = useAIAgentStore();
  // 追踪哪些合并组是展开状态
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { t } = useTranslation();

  const { getCurrentStepCellsIDs, viewMode } = useStore();

  const actionsToShow = useMemo(() => {
    return actions.filter(
      (action) =>
        (viewMode &&
          action.viewMode === viewMode &&
          viewMode === 'step' &&
          getCurrentStepCellsIDs().includes(action.cellId ?? '')) ||
        (viewMode &&
          action.viewMode === viewMode &&
          ((viewMode as any) === 'complete' || (viewMode as any) === 'create')) ||
        (viewMode && action.viewMode === viewMode && (viewMode as any) === 'dslc')
    );
  }, [actions, viewMode, getCurrentStepCellsIDs]);

  // 合并连续相同类型的actions
  const mergedActionsToShow = useMemo(() => {
    if (actionsToShow.length === 0) return [];

    const mergedActions = [];
    let currentGroup = {
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
    const filtered = qaList.filter((qa: any) => {
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
        return getCurrentStepCellsIDs().includes(qa.cellId);
      }

      // complete 和 dslc 模式显示所有匹配的QA
      return true;
    });

    return filtered;
  }, [qaList, viewMode, getCurrentStepCellsIDs]);

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

  // 渲染单个action项
  const renderActionItem = useCallback(
    (action: any, isOriginal = false, index = 0, totalCount = 1) => {
      const isUserQuestion = action.type === EVENT_TYPES.USER_ASK_QUESTION;

      return (
        <SpotlightCard
          key={isOriginal ? `original-${action.id}-${index}` : action.id}
          className="transition-all duration-300"
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {!isOriginal && (
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  #{totalCount - index}
                </span>
              )}
              <EventIcon type={action.type} onProcess={action.onProcess} />
              <span className={`text-xs ${getEventLabel(action.type, t).color}`}>
                {getEventLabel(action.type, t).text}
              </span>
              {!isOriginal && action.count > 1 && (
                <button
                  onClick={() => toggleGroup(action.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ring-theme-400 dark:ring-theme-600 text-theme-800 dark:text-theme-300 hover:ring-theme-500 dark:hover:ring-theme-500 transition-colors duration-300"
                >
                  <Layers size={12} />
                  <span className="text-xs font-medium">x{action.count}</span>
                  {expandedGroups[action.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">{action.timestamp}</span>
            </div>

            <div className="break-words text-gray-800 dark:text-gray-200">
              {isUserQuestion ? (
                // 用户问题：不折叠，完整显示
                <div>{action.content}</div>
              ) : action.type === 'system_event' ? (
                // 系统事件（action执行）：使用代码样式显示
                <pre className="text-xs bg-gray-50 dark:bg-gray-800/50 p-2 rounded-md overflow-x-auto whitespace-pre-wrap font-mono">
                  {action.content}
                </pre>
              ) : (
                // 其他类型：使用 ExpandableText
                <ExpandableText text={action.content} maxLines={3} />
              )}
            </div>

            {action.result && (
              <div className="mt-3 p-3 ring-1 ring-gray-300 dark:ring-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 break-words">
                {action.type === 'system_event' ? (
                  <pre className="text-xs whitespace-pre-wrap font-mono">{action.result}</pre>
                ) : (
                  <ExpandableText text={action.result} maxLines={3} />
                )}
              </div>
            )}

            {action.relatedQAIds?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {action.relatedQAIds.map((qaId: string) => {
                  const qaNumber = getQANumber(qaId);
                  if (qaNumber === null) return null;
                  return (
                    <button
                      key={qaId}
                      onClick={() => handleJumpToQA(qaId)}
                      className="inline-block px-2 py-1 text-xs bg-theme-50 dark:bg-theme-900/30 text-theme-700 dark:text-theme-300 rounded-md hover:bg-theme-100 dark:hover:bg-theme-800/50 transition-colors duration-200 border border-theme-200 dark:border-theme-700"
                    >
                      #{qaNumber}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SpotlightCard>
      );
    },
    [expandedGroups, toggleGroup, handleJumpToQA, getQANumber, t]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-14 shrink-0 flex items-center justify-center px-4 border-b border-gray-200 dark:border-white/10">
        <ViewSwitcher />
      </div>

      <div className="flex-1 px-2 sm:px-4 pb-5 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent hover:scrollbar-thumb-white/50">
        <style>{`
            .scrollbar-thin::-webkit-scrollbar { width: 4px; }
            .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
            .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; }
            .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
            .scrollbar-thin { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) transparent; }
          `}</style>

        {activeView === 'script' && (
          <div className="space-y-3 py-3">
            {mergedActionsToShow.map((action, index) => (
              <div key={action.id} className="space-y-2">
                {renderActionItem(action, false, index, mergedActionsToShow.length)}

                {expandedGroups[action.id] && action.count > 1 && (
                  <div className="space-y-2 mt-2 pb-2 pl-4">
                    {action.originalActions
                      .slice(1)
                      .map((origAction, origIndex) =>
                        renderActionItem(
                          origAction,
                          true,
                          origIndex,
                          action.originalActions.length - 1
                        )
                      )}
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
                <div
                  key={qa.id}
                  id={qa.id}
                  className={`mb-3 flex ${qa.type === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  {qa.type === 'user' ? (
                    <SpotlightCard className="p-4 w-full group relative">
                      {/* #标号和时间戳 - 仅在 hover 时显示 */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            #{qasToShow.length - index}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {qa.timestamp}
                          </span>
                        </div>
                      </div>
                      <div className="text-left break-words overflow-wrap-anywhere">
                        <ExpandableText text={qa.content} maxLines={5} />
                      </div>
                    </SpotlightCard>
                  ) : (
                    <div className="p-4 max-w-[85%] group relative">
                      {/* #标号和时间戳 - 仅在 hover 时显示 */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            #{qasToShow.length - index}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {qa.timestamp}
                          </span>
                        </div>
                      </div>

                      <div className="text-left break-words overflow-wrap-anywhere">
                        {!qa.content || qa.content.trim() === '' ? (
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <span>
                              {qa.agentType || qa.agent || 'AI'}{' '}
                              {t('rightSideBar.thinking') || 'is thinking...'}
                            </span>
                            {qa.thinkingStartAtMs && (
                              <span className="text-gray-400 dark:text-gray-500">
                                (
                                {Math.max(
                                  0,
                                  Math.round(
                                    ((qa.thinkingEndAtMs || Date.now()) - qa.thinkingStartAtMs) /
                                      1000
                                  )
                                )}
                                s )
                              </span>
                            )}
                          </div>
                        ) : (
                          <ExpandableText text={qa.content} maxLines={5} />
                        )}
                      </div>

                      {/* 显示工具调用信息 */}
                      {qa.toolCalls && qa.toolCalls.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            🛠️ 工具调用:
                          </div>
                          {qa.toolCalls.map((tool: any, toolIndex: number) => (
                            <ToolCallIndicator
                              key={`${qa.id}-tool-${toolIndex}`}
                              type={tool.type || tool.name}
                              content={tool.content || tool.arguments}
                              agent={tool.agent}
                            />
                          ))}
                        </div>
                      )}

                      {/* 解析内容中的XML标签作为工具调用显示 */}
                      {qa.content &&
                        (() => {
                          // 简单的XML标签检测
                          const xmlTagRegex = /<([a-z-]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi;
                          const matches = [...qa.content.matchAll(xmlTagRegex)];

                          if (matches.length > 0) {
                            return (
                              <div className="mt-3 space-y-2">
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                  ⚡ 执行的操作:
                                </div>
                                {matches.slice(0, 3).map((match, matchIndex) => (
                                  <ToolCallIndicator
                                    key={`${qa.id}-xml-${matchIndex}`}
                                    type={match[1]}
                                    content={
                                      match[0].length > 100
                                        ? match[0].substring(0, 100) + '...'
                                        : match[0]
                                    }
                                    agent={qa.agentType || qa.agent}
                                  />
                                ))}
                                {matches.length > 3 && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500">
                                    还有 {matches.length - 3} 个操作...
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}

                      {/* 回答后操作摘要（若无显式 toolCalls，也尽量提示完成了动作） */}
                      {(!qa.toolCalls || qa.toolCalls.length === 0) &&
                        qa.content &&
                        /<([a-z-]+)[\s\S]*?<\/\1>/i.test(qa.content) && (
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            ✅ {qa.agentType || qa.agent || 'AI'}{' '}
                            {t('rightSideBar.completedActions') ||
                              'completed some operations during answering.'}
                          </div>
                        )}
                    </div>
                  )}
                </div>
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
