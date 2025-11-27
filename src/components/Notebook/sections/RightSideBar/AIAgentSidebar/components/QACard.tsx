import React, { memo, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QAItem } from '@Store/models/agent';
import SpotlightCard from '@/components/UI/card/SpotlightCard';
import ExpandableText from '@RightSidebar/components/ExpandableText';
import ToolCallIndicator from '@RightSidebar/components/ToolCallIndicator';
import ShinyText from '@/components/UI/magic/shiny-text';
import { ToolCall } from '../types';

interface QACardProps {
  qa: QAItem;
  index: number;
  totalCount: number;
}

const QACard: React.FC<QACardProps> = ({ qa, index, totalCount }) => {
  const { t } = useTranslation();
  const isUser = qa.type === 'user';
  const qaNumber = totalCount - index;

  // Memoize XML parsing to avoid re-parsing on every render
  const xmlMatches = useMemo(() => {
    if (!qa.content) return [];
    const xmlTagRegex = /<([a-z-]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi;
    return [...qa.content.matchAll(xmlTagRegex)];
  }, [qa.content]);

  const hasCompletedActions = useMemo(() => {
    if (qa.toolCalls && qa.toolCalls.length > 0) return false; // Already handled by toolCalls
    if (!qa.content) return false;
    return /<([a-z-]+)[\s\S]*?<\/\1>/i.test(qa.content);
  }, [qa.content, qa.toolCalls]);

  // Live timer for thinking duration
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (qa.thinkingStartAtMs && !qa.thinkingEndAtMs) {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [qa.thinkingStartAtMs, qa.thinkingEndAtMs]);

  const thinkingDuration = useMemo(() => {
    if (!qa.thinkingStartAtMs) return null;
    const end = qa.thinkingEndAtMs || now;
    return Math.max(0, Math.round((end - qa.thinkingStartAtMs) / 1000));
  }, [qa.thinkingStartAtMs, qa.thinkingEndAtMs, now]);

  if (isUser) {
    return (
      <div id={qa.id} className="mb-3 flex justify-start">
        <SpotlightCard className="p-4 w-full group relative">
          {/* #标号和时间戳 - 仅在 hover 时显示 */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                #{qaNumber}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{qa.timestamp}</span>
            </div>
          </div>
          <div className="text-left break-words overflow-wrap-anywhere">
            <ExpandableText text={qa.content} maxLines={5} />
          </div>
        </SpotlightCard>
      </div>
    );
  }

  return (
    <div id={qa.id} className="mb-3 flex justify-end">
      <div className="p-4 max-w-[85%] group relative">
        {/* #标号和时间戳 - 仅在 hover 时显示 */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              #{qaNumber}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{qa.timestamp}</span>
          </div>
        </div>

        <div className="text-left break-words overflow-wrap-anywhere">
          {(!qa.content || qa.content.trim() === '') &&
          (!qa.toolCalls || qa.toolCalls.length === 0) &&
          xmlMatches.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <ShinyText
                text={`${qa.agentType || qa.agent || 'AI'} ${t('rightSideBar.thinking') || 'is thinking...'}`}
                disabled={false}
                speed={3}
                className="font-medium"
              />
              {thinkingDuration !== null && (
                <span className="text-gray-400 dark:text-gray-500">({thinkingDuration}s)</span>
              )}
            </div>
          ) : (
            <ExpandableText text={qa.content} maxLines={5} />
          )}
        </div>

        {/* 显示工具调用信息 */}
        {qa.toolCalls && qa.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {(() => {
              const groupedTools: ToolCall[] = [];
              if (qa.toolCalls) {
                let currentGroup: ToolCall | null = null;

                qa.toolCalls.forEach((tool) => {
                  const isAddText = tool.type === 'add-text' || tool.type === 'add';

                  if (isAddText) {
                    // Try to parse content to check for heading
                    let isHeading = false;
                    try {
                      // Arguments might be a JSON string or direct content
                      const args = tool.arguments ? JSON.parse(tool.arguments) : {};
                      const content = args.content || tool.content || '';
                      if (content.trim().startsWith('#')) {
                        isHeading = true;
                      }
                    } catch (e) {
                      // If parsing fails, check content directly if available
                      if (tool.content && tool.content.trim().startsWith('#')) {
                        isHeading = true;
                      }
                    }

                    if (currentGroup && !isHeading) {
                      // Continue current group
                      // We don't need to merge content for display, just grouping the indicator
                    } else {
                      // Start new group
                      if (currentGroup) {
                        groupedTools.push(currentGroup);
                      }
                      currentGroup = {
                        ...tool,
                        type: 'edit-notebook', // Rename to edit-notebook
                        name: 'edit-notebook',
                      };
                    }
                  } else {
                    // Push pending group
                    if (currentGroup) {
                      groupedTools.push(currentGroup);
                      currentGroup = null;
                    }
                    groupedTools.push(tool);
                  }
                });

                // Push remaining group
                if (currentGroup) {
                  groupedTools.push(currentGroup);
                }
              }

              return groupedTools.map((tool: ToolCall, toolIndex: number) => (
                <ToolCallIndicator
                  key={`${qa.id}-tool-${toolIndex}`}
                  type={tool.type || tool.name || 'unknown'}
                  content={tool.content || tool.arguments}
                  agent={tool.agent}
                />
              ));
            })()}
          </div>
        )}

        {/* 解析内容中的XML标签作为工具调用显示 */}
        {/* 解析内容中的XML标签作为工具调用显示 */}
        {xmlMatches.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">⚡ 执行的操作:</div>
            {(() => {
              // Convert XML matches to ToolCall objects
              const xmlTools: ToolCall[] = xmlMatches.map((match) => ({
                type: match[1],
                content: match[0],
                name: match[1],
                agent: qa.agentType || qa.agent,
              }));

              const groupedTools: ToolCall[] = [];
              let currentGroup: ToolCall | null = null;

              xmlTools.forEach((tool) => {
                const isAddText = tool.type === 'add-text' || tool.type === 'add';

                if (isAddText) {
                  // For XML, the content IS the tool content (the whole tag)
                  // We check if the inner content starts with #
                  // match[0] is full tag, match[1] is tag name.
                  // We need to extract inner content to check for heading.
                  // Regex used: /<([a-z-]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi
                  // But the current regex in useMemo is: /<([a-z-]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi
                  // It doesn't capture inner content as a group.
                  // Let's try to extract it simply by stripping tags.

                  let isHeading = false;
                  const innerContent = tool.content?.replace(/<[^>]+>/g, '').trim() || '';
                  if (innerContent.startsWith('#')) {
                    isHeading = true;
                  }

                  if (currentGroup && !isHeading) {
                    // Continue current group
                  } else {
                    // Start new group
                    if (currentGroup) {
                      groupedTools.push(currentGroup);
                    }
                    currentGroup = {
                      ...tool,
                      type: 'edit-notebook',
                      name: 'edit-notebook',
                    };
                  }
                } else {
                  // Push pending group
                  if (currentGroup) {
                    groupedTools.push(currentGroup);
                    currentGroup = null;
                  }
                  groupedTools.push(tool);
                }
              });

              // Push remaining group
              if (currentGroup) {
                groupedTools.push(currentGroup);
              }

              return groupedTools.map((tool: ToolCall, toolIndex: number) => (
                <ToolCallIndicator
                  key={`${qa.id}-xml-${toolIndex}`}
                  type={tool.type || tool.name || 'unknown'}
                  content={tool.content}
                  agent={tool.agent}
                />
              ));
            })()}
          </div>
        )}

        {/* 回答后操作摘要（若无显式 toolCalls，也尽量提示完成了动作） */}
        {hasCompletedActions && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            ✅ {qa.agentType || qa.agent || 'AI'}{' '}
            {t('rightSideBar.completedActions') || 'completed some operations during answering.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(QACard);
