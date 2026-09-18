import React, { memo } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionItem } from '@Store/models/agent';
import { EVENT_TYPES } from '@Store/models/agent';
import SpotlightCard from '@/components/UI/card/SpotlightCard';
import EventIcon from '@RightSidebar/components/EventIcon';
import ExpandableText from '@RightSidebar/components/ExpandableText';
import { getEventLabel } from '@RightSidebar/utils/eventUtils';
import { MergedAction } from '../types';

interface ActionCardProps {
  action: ActionItem | MergedAction;
  isOriginal?: boolean;
  index?: number;
  totalCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
  onJumpToQA?: (qaId: string) => void;
  getQANumber?: (qaId: string) => number | null;
}

const ActionCard: React.FC<ActionCardProps> = ({
  action,
  isOriginal = false,
  index = 0,
  totalCount = 1,
  isExpanded = false,
  onToggleExpand,
  onJumpToQA,
  getQANumber,
}) => {
  const { t } = useTranslation();
  const isUserQuestion = action.type === EVENT_TYPES.USER_ASK_QUESTION;
  const isMerged = 'count' in action && action.count > 1;

  return (
    <SpotlightCard className="transition-all duration-300">
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
          {!isOriginal && isMerged && (
            <button
              onClick={() => onToggleExpand?.(action.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ring-theme-400 dark:ring-theme-600 text-theme-800 dark:text-theme-300 hover:ring-theme-500 dark:hover:ring-theme-500 transition-colors duration-300"
            >
              <Layers size={12} />
              <span className="text-xs font-medium">x{action.count}</span>
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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

        {action.relatedQAIds && action.relatedQAIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {action.relatedQAIds.map((qaId: string) => {
              const qaNumber = getQANumber?.(qaId);
              if (qaNumber === null || qaNumber === undefined) return null;
              return (
                <button
                  key={qaId}
                  onClick={() => onJumpToQA?.(qaId)}
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
};

export default memo(ActionCard);
