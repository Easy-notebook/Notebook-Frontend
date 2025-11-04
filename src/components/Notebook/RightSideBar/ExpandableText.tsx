import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { filterSectionStageText } from '../utils/String';

export interface ExpandableTextProps { text: string; maxLines?: number }

const ExpandableText: React.FC<ExpandableTextProps> = ({ text, maxLines = 3 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = () => setIsExpanded(!isExpanded);
  const { t } = useTranslation();

  const filteredText = filterSectionStageText(text);

  // 在外层使用者中处理空内容以展示思考状态，这里不再渲染“No content”
  if (!filteredText || filteredText.trim() === '') {
    return <></>;
  }

  const lines = filteredText.split('\n');
  const exceedsMaxLines = lines.length > maxLines;

  return (
    <div className="relative">
      <div
        className={`
          text-sm text-gray-700 leading-relaxed tracking-wide
          transition-all duration-200 ease-in-out
          prose prose-sm max-w-none break-words overflow-wrap-anywhere
          prose-headings:font-medium prose-headings:my-1 prose-headings:text-gray-800
          prose-p:my-0.5 prose-p:leading-6 prose-p:text-gray-700 prose-p:break-words
          prose-pre:bg-gray-100 prose-pre:rounded-md prose-pre:p-2 prose-pre:my-1 prose-pre:border prose-pre:overflow-x-auto prose-pre:text-xs
          prose-code:text-theme-600 prose-code:bg-theme-50 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:break-all
          prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0.5 prose-li:text-gray-700 prose-li:break-words
          prose-strong:text-gray-800 prose-em:text-gray-600
          ${!isExpanded && exceedsMaxLines ? 'overflow-hidden' : ''}
        `}
        style={{
          maxHeight: !isExpanded && exceedsMaxLines ? `${maxLines * 1.5}em` : 'none',
          WebkitLineClamp: !isExpanded && exceedsMaxLines ? maxLines : 'none',
          display: !isExpanded && exceedsMaxLines ? '-webkit-box' : 'block',
          WebkitBoxOrient: !isExpanded && exceedsMaxLines ? 'vertical' as any : 'initial',
        }}
      >
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
            code: ({ children, className }) => {
              const isInline = !className;
              return isInline ? (
                <code className="bg-theme-50 text-theme-700 px-1 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              ) : (
                <code className={className}>{children}</code>
              );
            }
          }}
        >
          {/* 预处理内容：将单个换行符转换为 markdown 换行格式（两个空格 + 换行符） */}
          {filteredText.replace(/(?<!\n)\n(?!\n)/g, '  \n')}
        </ReactMarkdown>
      </div>

      {exceedsMaxLines && (
        <button
          onClick={toggleExpand}
          className="mt-2 text-xs font-medium text-theme-600 hover:text-theme-800 transition-colors duration-300 flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={12} />
              {t('rightSideBar.collapseDetails')}
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              {t('rightSideBar.viewDetails')}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ExpandableText;


