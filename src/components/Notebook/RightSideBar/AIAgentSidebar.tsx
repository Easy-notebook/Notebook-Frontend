import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  MessageSquare,
  Layers,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from 'lucide-react';

import useStore from '@Store/notebookStore';
import { useAIAgentStore, EVENT_TYPES } from '@Store/AIAgentStore';
import StateMachineDebugger from './StateMachineDebugger';
import AIPlanningContextDebugger from './AIPlanningContextDebugger';
import WorkflowTODOPanel from './WorkflowTODOPanel';
import ViewSwitcher from './ViewSwitcher';
import ToolCallIndicator from './ToolCallIndicator';
import AgentInfo from './AgentInfo';
import ExpandableText from './ExpandableText';
import EventIcon from './EventIcon';
import { getEventLabel } from './eventUtils';

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

      // 如果当前action与上一个action类型相同，合并它们
      if (currentAction.type === prevAction.type) {
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
        // 类型不同，将当前组添加到结果中并开始新组
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

  // 渲染单个action项
  const renderActionItem = useCallback(
    (action: any, isOriginal = false, index = 0, totalCount = 1) => {
      return (
        <div
          key={isOriginal ? `original-${action.id}-${index}` : action.id}
          className={`
          p-3 transition-all duration-300 rounded-lg
          ${
            index === 0 && !isOriginal
              ? 'ring-1 ring-theme-300 dark:ring-theme-700'
              : 'hover:ring-1 hover:ring-gray-300 dark:hover:ring-gray-700'
          }
        `}
        >
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {!isOriginal && (
              <span className="text-xs font-semibold text-gray-700">[{totalCount - index}]</span>
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
            <span className="text-xs text-gray-500">{action.timestamp}</span>
          </div>

          <div className="break-words">
            <ExpandableText text={action.content} maxLines={3} />
          </div>

          {action.result && (
            <div className="mt-3 p-3 ring-1 ring-gray-300 dark:ring-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 break-words">
              <ExpandableText text={action.result} maxLines={3} />
            </div>
          )}

          {action.relatedQAIds?.length > 0 && (
            <button
              onClick={() => handleJumpToQA(action.relatedQAIds[0])}
              className="flex items-center gap-1 text-xs text-theme-600 hover:text-theme-800 mt-2 transition-colors duration-300"
            >
              <MessageSquare size={16} />
              <span>
                {t('rightSideBar.linkedToQA')} {action.relatedQAIds.join(', ')}
              </span>
            </button>
          )}
        </div>
      );
    },
    [expandedGroups, toggleGroup, handleJumpToQA, t]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-16 flex-shrink-0 flex items-center justify-between px-3 sm:px-5 border-b border-gray-200 dark:border-white/10 backdrop-blur-sm">
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
          <div className="space-y-1 py-3">
            {mergedActionsToShow.map((action, index) => (
              <div key={action.id} className="space-y-1">
                {renderActionItem(action, false, index, mergedActionsToShow.length)}

                {expandedGroups[action.id] && action.count > 1 && (
                  <div className="space-y-3 mt-2 pb-2">
                    {action.originalActions.slice(1).map((origAction, origIndex) => (
                      <div key={`${origAction.id}-${origIndex}`}>
                        {renderActionItem(
                          origAction,
                          true,
                          origIndex,
                          action.originalActions.length - 1
                        )}
                      </div>
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
                <div key={qa.id} id={qa.id} className="mb-3">
                  <div
                    className={`
                        p-4 rounded-lg shadow-sm transition-all duration-300
                        ${
                          index === 0
                            ? 'ring-2 ring-theme-400 dark:ring-theme-600'
                            : qa.type === 'user'
                              ? 'ring-1 ring-theme-300 dark:ring-theme-700 hover:ring-theme-400 dark:hover:ring-theme-600'
                              : 'ring-1 ring-gray-300 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-600'
                        }
                      `}
                  >
                    <div
                      className={`flex items-center gap-2 mb-2 ${
                        qa.type === 'user' ? 'justify-start' : 'justify-start'
                      }`}
                    >
                      <span className="text-xs font-semibold text-gray-700">
                        [{qasToShow.length - index}]
                      </span>
                      <EventIcon
                        type={
                          qa.type === 'assistant'
                            ? EVENT_TYPES.AI_REPLYING_QUESTION
                            : EVENT_TYPES.USER_ASK_QUESTION
                        }
                        onProcess={qa.onProcess}
                      />
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          qa.type === 'user'
                            ? 'ring-1 ring-theme-400 dark:ring-theme-600 text-theme-700 dark:text-theme-300'
                            : 'ring-1 ring-green-400 dark:ring-green-600 text-green-700 dark:text-green-300'
                        }`}
                      >
                        {qa.type === 'user' ? t('rightSideBar.you') : t('rightSideBar.ai')}
                      </span>

                      {/* 显示Agent信息 */}
                      {qa.type === 'assistant' && (
                        <AgentInfo agent={qa.agent} model={qa.model} type={qa.agentType} />
                      )}

                      <span className="text-xs text-gray-500">{qa.timestamp}</span>
                    </div>

                    <div className="text-left break-words overflow-wrap-anywhere">
                      {(!qa.content || qa.content.trim() === '') && qa.type === 'assistant' ? (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>
                            {qa.agentType || qa.agent || 'AI'}{' '}
                            {t('rightSideBar.thinking') || 'is thinking...'}
                          </span>
                          {qa.thinkingStartAtMs && (
                            <span className="text-gray-400">
                              (
                              {Math.max(
                                0,
                                Math.round(
                                  ((qa.thinkingEndAtMs || Date.now()) - qa.thinkingStartAtMs) / 1000
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
                    {qa.type === 'assistant' && qa.toolCalls && qa.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-gray-500 mb-2">🛠️ 工具调用:</div>
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
                    {qa.type === 'assistant' &&
                      qa.content &&
                      (() => {
                        // 简单的XML标签检测
                        const xmlTagRegex = /<([a-z-]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi;
                        const matches = [...qa.content.matchAll(xmlTagRegex)];

                        if (matches.length > 0) {
                          return (
                            <div className="mt-3 space-y-2">
                              <div className="text-xs text-gray-500 mb-2">⚡ 执行的操作:</div>
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
                                <div className="text-xs text-gray-400">
                                  还有 {matches.length - 3} 个操作...
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}

                    {/* 回答后操作摘要（若无显式 toolCalls，也尽量提示完成了动作） */}
                    {qa.type === 'assistant' &&
                      (!qa.toolCalls || qa.toolCalls.length === 0) &&
                      qa.content &&
                      /<([a-z-]+)[\s\S]*?<\/\1>/i.test(qa.content) && (
                        <div className="mt-2 text-xs text-gray-500">
                          ✅ {qa.agentType || qa.agent || 'AI'}{' '}
                          {t('rightSideBar.completedActions') ||
                            'completed some operations during answering.'}
                        </div>
                      )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {(activeView as any) === 'debug' && (
          <div className="space-y-4">
            <WorkflowTODOPanel />
            <StateMachineDebugger />
            <AIPlanningContextDebugger />
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
