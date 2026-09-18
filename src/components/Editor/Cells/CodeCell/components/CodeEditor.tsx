import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { CodeEditorProps } from '../utils/types';
import { EXPAND_THRESHOLD } from '../utils';
import { codeLanguageExtensions } from '../utils/languageSupport';
import { useTheme } from '@/contexts/ThemeContext';
import { useEditorReadOnly } from '../../../EditorAccessContext';
import { useCodeEditorActivation } from '../model/useCodeEditorActivation';

/**
 * Code editor component with CodeMirror
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  cell,
  content,
  isExecuting,
  isCurrentCell,
  dslcMode,
  isInDetachedView,
  contentHeight,
  isExpanded,
  isHovering,
  editorRef,
  codeBlockWrapperRef,
  onHoverChange,
  onExpand,
  onCollapse,
  onChange,
  onKeyDown,
  onCopyCode,
}) => {
  const { resolvedTheme } = useTheme();
  const readOnly = useEditorReadOnly();
  const activation = useCodeEditorActivation(cell.id, !!isCurrentCell || !!isInDetachedView);
  const value =
    content ?? (typeof cell.content === 'string' ? cell.content : String(cell.content || ''));
  return (
    <div
      ref={activation.container}
      className={`relative ${isInDetachedView ? 'flex-1 min-h-0' : ''}`}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          maxHeight: isInDetachedView
            ? 'none'
            : contentHeight > EXPAND_THRESHOLD
              ? isExpanded
                ? `${contentHeight}px`
                : `${EXPAND_THRESHOLD}px`
              : 'none',
          transition: isInDetachedView ? 'none' : 'max-height 300ms ease-in-out',
          willChange: isInDetachedView ? 'auto' : 'max-height',
        }}
      >
        {/* Copy button */}
        <div
          className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${
            isHovering ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            minWidth: '48px',
            minHeight: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onCopyCode}
            className="px-2 py-1 text-xs text-gray-700 dark:text-gray-100 bg-white/70 dark:bg-gray-800/80 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors backdrop-blur-sm"
            title="Copy code"
            style={{
              minWidth: '44px',
              textAlign: 'center',
            }}
          >
            Copy
          </button>
        </div>

        <div
          className={`${isInDetachedView ? 'h-full' : 'h-full'} overflow-auto`}
          ref={codeBlockWrapperRef}
        >
          {activation.active ? (
            <CodeMirror
              value={value}
              onCreateEditor={activation.onCreateEditor}
              height={isInDetachedView ? '100%' : 'auto'}
              extensions={codeLanguageExtensions(cell.language)}
              onChange={readOnly ? undefined : onChange}
              onKeyDown={readOnly ? undefined : onKeyDown}
              theme={resolvedTheme === 'dark' ? dracula : 'light'}
              style={{
                fontSize: '16px',
                lineHeight: '1.5',
                height: isInDetachedView ? '100%' : 'auto',
              }}
              readOnly={readOnly || isExecuting || dslcMode}
              autoFocus={isCurrentCell && !dslcMode && !readOnly}
              ref={editorRef}
            />
          ) : (
            <pre
              className="m-0 px-3 py-1 font-mono whitespace-pre overflow-hidden"
              style={{ fontSize: 16, lineHeight: '24px', minHeight: 32 }}
              tabIndex={0}
              aria-label="Code preview; focus to activate editor"
              onFocus={activation.activate}
              onPointerDown={activation.activate}
            >
              {value || ' '}
            </pre>
          )}
          {isExecuting && (
            <div className="absolute inset-0 flex items-center justify-center rounded-b-lg">
              <Loader2 className="w-16 h-16 animate-spin text-red-500" />
            </div>
          )}
        </div>

        {/* Expand/Collapse button */}
        {!isInDetachedView && contentHeight > EXPAND_THRESHOLD && (
          <div
            className={`absolute bottom-0 left-0 right-0 flex justify-center items-center z-30 transition-opacity duration-200 ${
              isHovering ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {!isExpanded ? (
              <button
                onClick={onExpand}
                className="px-4 py-1.5 text-sm text-white rounded-t-lg shadow-lg hover:bg-gray-800 transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-theme-500 flex items-center gap-1"
                title="Expand"
              >
                <span>Expand</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onCollapse}
                className="px-4 py-1.5 text-sm text-white rounded-t-lg shadow-lg hover:bg-gray-800 transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-theme-500 flex items-center gap-1"
                title="Collapse"
              >
                <span>Collapse</span>
                <ChevronUp className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Gradient overlay for collapsed state */}
        {!isInDetachedView && !isExpanded && contentHeight > EXPAND_THRESHOLD && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-800 to-transparent pointer-events-none"></div>
        )}
      </div>
    </div>
  );
};
