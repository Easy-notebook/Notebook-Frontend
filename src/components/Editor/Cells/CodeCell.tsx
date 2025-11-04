import React, {
    useCallback,
    useRef,
    useMemo,
    useState,
    useEffect,
} from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { Sparkles, CheckCircle } from 'lucide-react';

import {
    Play,
    Trash2,
    Loader2,
    X,
    RefreshCw,
    Square,
    Code,
    Monitor,
    Layout,
    InfoIcon,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Minimize2,
    Maximize2,
    Split,
} from 'lucide-react';

import { AnsiUp } from 'ansi_up';
import ReactMarkdown from 'react-markdown';

import useStore from '../../../store/notebookStore';
import useCodeStore, { DISPLAY_MODES } from '../../../store/codeStore';
import { sendCurrentCellExecuteCodeError_should_debug } from '../../../store/autoActions';
import editorLogger from '../../../utils/logger/editor_logger';

const ansi_up = new AnsiUp();

interface Cell {
  id: string;
  content: string;
  outputs?: Output[];
  description?: string;
}

interface Output {
  type: 'image' | 'text' | 'error' | 'html';
  content: string;
  key?: string;
}

interface CodeCellProps {
  cell: Cell;
  onDelete?: (cellId: string) => void;
  isStepMode?: boolean;
  dslcMode?: boolean;
  finished_thinking?: boolean;
  thinkingText?: string;
  isInDetachedView?: boolean; // 新增：是否在独立窗口中
  isDemoMode?: boolean; // 新增：是否在演示模式中
}

const processOutput = (output: any): Output | null => {
    if (!output) return null;

    if (output.type === 'image') {
        try {
            return {
                ...output,
                content:
                    typeof output.content === 'object'
                        ? JSON.stringify(output.content)
                        : String(output.content),
                key: output.key || `image-${Date.now()}-${Math.random()}`,
            };
        } catch (error) {
            console.error('Error processing image output:', error);
            return {
                type: 'error',
                content: 'Error processing image output',
                key: `error-${Date.now()}-${Math.random()}`,
            };
        }
    }

    if (output.type === 'text' || output.type === 'error') {
        try {
            return {
                ...output,
                content: String(output.content || ''),
                key: output.key || `${output.type}-${Date.now()}-${Math.random()}`,
            };
        } catch (error) {
            console.error('Error processing text/error output:', error);
            return {
                type: 'error',
                content: 'Error processing output',
                key: `error-${Date.now()}-${Math.random()}`,
            };
        }
    }

    return output;
};

const CodeCell: React.FC<CodeCellProps> = ({ cell, onDelete, isStepMode = false, dslcMode = false, finished_thinking = false, thinkingText = "finished thinking", isInDetachedView = false, isDemoMode = false }) => {
    // 合并 useStore 的调用
    const {
        currentCellId,
        setCurrentCell,
        cells,
        updateCell,
        clearCellOutputs,
        setEditingCellId,
        detachedCellId,
        setDetachedCellId,
        isDetachedCellFullscreen,
        toggleDetachedCellFullscreen,
    } = useStore();

    // 独立窗口状态
    const isDetached = detachedCellId === cell.id;

    // 当前是否为聚焦的代码单元
    const isCurrentCell = currentCellId === cell.id;

    const getCellExecState = useCodeStore((state) => state.getCellExecState);
    const executeCell = useCodeStore((state) => state.executeCell);
    const cancelCellExecution = useCodeStore((state) => state.cancelCellExecution);
    const setCellMode = useCodeStore((state) => state.setCellMode);

    // 当前 cell 的执行状态
    const cellExec = getCellExecState(cell.id);
    const isExecuting = cellExec.isExecuting;
    const isCancelling = cellExec.isCancelling;
    const elapsedTime = cellExec.elapsedTime || 0;

    // 当前 cell 的显示模式 - 演示模式下默认只显示输出
    const defaultMode = isDemoMode ? DISPLAY_MODES.OUTPUT_ONLY : DISPLAY_MODES.COMPLETE;
    const cellMode =
        useCodeStore((state) => state.cellModes[cell.id]) || defaultMode;

    // 添加一个状态来控制是否显示thinking状态
    const [showThinking, setShowThinking] = useState(true);

    // 演示模式下初始化显示模式为OUTPUT_ONLY
    useEffect(() => {
        if (isDemoMode && !useCodeStore.getState().cellModes[cell.id]) {
            setCellMode(cell.id, DISPLAY_MODES.OUTPUT_ONLY);
        }
    }, [isDemoMode, cell.id, setCellMode]);

    // 检查是否为 DSLC JSON 指令
    const isDslcCommand = useMemo(() => {
        if (!cell.content || !dslcMode) return false;
        try {
            const content =
                typeof cell.content === 'string'
                    ? cell.content
                    : String(cell.content);
            if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
                const cmd = JSON.parse(content.trim());
                return cmd.dslc_command === true;
            }
        } catch (e) {
            console.error('DSLC 指令解析错误:', e);
            return false;
        }
        return false;
    }, [cell.content, dslcMode]);

    // （移除重复的 DOM 级别 keydown 监听，统一用 CodeMirror onKeyDown 处理）

    // 执行 DSLC 指令
    useEffect(() => {
        if (isDslcCommand && dslcMode && cell.content) {
            try {
                const cmd = JSON.parse(cell.content);
                if (cmd.action === 'execute' && cmd.code) {
                    // 更新单元格代码内容
                    updateCell(cell.id, cmd.code);
                    // 延迟执行代码以确保内容已更新
                    setTimeout(() => {
                        executeCell(cell.id);
                    }, 100);
                }
            } catch (e) {
                console.error('DSLC 指令解析错误:', e);
            }
        }
    }, [isDslcCommand, dslcMode, cell.id, cell.content, updateCell, executeCell]);

    // 添加一个新的状态来跟踪输出变化
    const [outputUpdateKey, setOutputUpdateKey] = useState(0);

    // 修改输出处理逻辑
    const processedOutputs = useMemo(() => {
        if (cell.outputs && Array.isArray(cell.outputs)) {
            return cell.outputs
                .map(processOutput)
                .filter((o): o is Output => o !== null)
                .map((output) => ({
                    ...output,
                    key: output.key || `output-${Date.now()}-${Math.random()}`,
                }));
        }
        return [];
    }, [cell.outputs]); // 添加 outputUpdateKey 作为依赖

    // 添加输出变化监听
    useEffect(() => {
        if (isExecuting) {
            const interval = setInterval(() => {
                setOutputUpdateKey(prev => prev + 1);
            }, 100); // 每100ms检查一次输出变化

            return () => clearInterval(interval);
        }
    }, [isExecuting]);

    // 输出动画控制状态
    const [outputVisible, setOutputVisible] = useState(false);

    // 监听输出变化，添加动画效果
    useEffect(() => {
        if (processedOutputs.length > 0) {
            setOutputVisible(true);
        } else {
            setOutputVisible(false);
        }
    }, [processedOutputs.length]);

    // DSLC 模式下输出调试日志（仅在开发模式下）
    useEffect(() => {
        if (dslcMode && processedOutputs.length > 0 && process.env.NODE_ENV === 'development') {
            console.log('DSLC 模式下有输出:', cell.id, processedOutputs);
        }
    }, [dslcMode, processedOutputs, cell.id]);

    // 执行状态变量
    const wasExecuting = useRef(false);
    type DisplayMode = typeof DISPLAY_MODES[keyof typeof DISPLAY_MODES];
    const prevMode = useRef<DisplayMode | null>(null);
    const [isTransitioningToOutput, setIsTransitioningToOutput] = useState(false);

    // 时间格式化
    const formatElapsedTime = useCallback((seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds
                .toString()
                .padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }, []);

    // 执行 / 取消
    const handleExecute = useCallback(() => {
        executeCell(cell.id);
    }, [cell.id, executeCell]);

    const handleCancel = useCallback(() => {
        cancelCellExecution(cell.id);
    }, [cell.id, cancelCellExecution]);

    // 更新代码内容
    const handleChange = useCallback(
        (value: string) => {
            updateCell(cell.id, value);
        },
        [cell.id, updateCell]
    );

    // 清空输出
    const handleClearOutput = useCallback(() => {
        clearCellOutputs(cell.id);
    }, [cell.id, clearCellOutputs]);

    const editorRef = useRef<any>(null);
    const codeContainerRef = useRef<HTMLDivElement | null>(null);

    // 检查游标是否在第一行
    const isCursorAtFirstLine = useCallback(() => {
        if (!editorRef.current?.view) return false;
        const view = editorRef.current.view;
        const state = view.state;
        const cursorPos = state.selection.main.head;
        const line = state.doc.lineAt(cursorPos);
        return line.number === 1;
    }, []);

    // 检查游标是否在最后一行
    const isCursorAtLastLine = useCallback(() => {
        if (!editorRef.current?.view) return false;
        const view = editorRef.current.view;
        const state = view.state;
        const cursorPos = state.selection.main.head;
        const line = state.doc.lineAt(cursorPos);
        return line.number === state.doc.lines;
    }, []);
    // 检查游标是否在文档起始位置（行首且第一行）
    const isCursorAtDocStart = useCallback(() => {
        if (!editorRef.current?.view) return false;
        const view = editorRef.current.view;
        const state = view.state;
        const cursorPos = state.selection.main.head;
        const line = state.doc.lineAt(cursorPos);
        return cursorPos === line.from && line.number === 1;
    }, []);

    // 检查游标是否在文档末尾位置（行尾且最后一行）
    const isCursorAtDocEnd = useCallback(() => {
        if (!editorRef.current?.view) return false;
        const view = editorRef.current.view;
        const state = view.state;
        const cursorPos = state.selection.main.head;
        const line = state.doc.lineAt(cursorPos);
        return cursorPos === line.to && line.number === state.doc.lines;
    }, []);


    // 跟踪导航方向以正确定位光标
    const lastNavigationDirection = useRef<'up' | 'down' | null>(null);

    // 监听跨cell导航事件
    useEffect(() => {
        const handleCellNavigation = (event: CustomEvent) => {
            if (event.detail?.targetCellId === cell.id) {
                lastNavigationDirection.current = event.detail.direction;
            }
        };

        window.addEventListener('cell-navigation', handleCellNavigation as EventListener);
        return () => {
            window.removeEventListener('cell-navigation', handleCellNavigation as EventListener);
        };
    }, [cell.id]);

    // 当成为当前cell时，主动聚焦编辑器，确保跨cell跳转后立即可编辑
    useEffect(() => {
        if (isCurrentCell && !dslcMode) {
            setTimeout(() => {
                try {
                    // 正确聚焦 CodeMirror 编辑器
                    if (editorRef.current?.view) {
                        const view = editorRef.current.view;
                        view.focus();
                        
                        // 根据导航方向定位光标
                        if (lastNavigationDirection.current === 'down') {
                            // 从上方导航过来，光标定位到文档开头
                            const pos = 0;
                            view.dispatch({
                                selection: { anchor: pos, head: pos }
                            });
                        } else if (lastNavigationDirection.current === 'up') {
                            // 从下方导航过来，光标定位到文档末尾
                            const pos = view.state.doc.length;
                            view.dispatch({
                                selection: { anchor: pos, head: pos }
                            });
                        }
                        
                        // 重置导航方向
                        lastNavigationDirection.current = null;
                        
                        editorLogger.logFocusChange(cell.id, 'code', true);
                    } else if (editorRef.current) {
                        (editorRef.current as any)?.focus?.();
                    }
                } catch {}
            }, 100); // 增加延迟确保DOM更新完成
        }
    }, [isCurrentCell, dslcMode, cell.id]);


    // 快捷键：Ctrl+Enter 执行、Alt+↑/↓ 切换上下单元格、Delete/Backspace 删除空单元格
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            const state = useStore.getState();
            const navCells = state.getCurrentViewCells ? state.getCurrentViewCells() : state.cells;
            const currentIndex = navCells.findIndex((c: any) => c.id === cell.id);

            if (event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                handleExecute();
            } else if (
                event.altKey &&
                (event.key === 'ArrowUp' || event.key === 'ArrowDown')
            ) {
                event.preventDefault();
                const newIndex =
                    event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;

                if (newIndex >= 0 && newIndex < cells.length) {
                    const targetCell = cells[newIndex];
                    setTimeout(() => {
                        if (targetCell.type === 'code') {
                            setCurrentCell(targetCell.id);
                            if (editorRef.current) {
                                (editorRef.current as any)?.focus();
                            }
                        } else if (targetCell.type === 'markdown') {
                            setCurrentCell(targetCell.id);
                            setEditingCellId(targetCell.id);
                        }
                    }, 0);
                }
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                // 检查是否需要跨cell导航
                const direction = event.key === 'ArrowUp' ? 'up' : 'down';
                const isAtFirstLine = event.key === 'ArrowUp' && isCursorAtFirstLine();
                const isAtLastLine = event.key === 'ArrowDown' && isCursorAtLastLine();

                const cursorInfo = {
                    line: 0,
                    isAtFirstLine,
                    isAtLastLine,
                    isAtDocStart: isCursorAtDocStart(),
                    isAtDocEnd: isCursorAtDocEnd()
                };

                editorLogger.logNavigationAttempt(cell.id, 'code', direction, cursorInfo);

                if (isAtFirstLine || isAtLastLine) {
                    event.preventDefault();
                    const newIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;

                    if (newIndex >= 0 && newIndex < cells.length) {
                        const targetCell = cells[newIndex];
                        editorLogger.logNavigationSuccess(cell.id, targetCell.id, 'code', targetCell.type as any, direction);

                        if (targetCell.type === 'code') {
                            // 设置导航方向以正确定位光标
                            const targetCodeElement = document.querySelector(`[data-cell-id="${targetCell.id}"]`);
                            if (targetCodeElement) {
                                // 通过 DOM 查找目标 CodeCell 组件并设置导航方向
                                setTimeout(() => {
                                    // 使用全局事件来传递导航方向信息
                                    window.dispatchEvent(new CustomEvent('cell-navigation', {
                                        detail: { targetCellId: targetCell.id, direction }
                                    }));
                                }, 0);
                            }
                            setCurrentCell(targetCell.id);
                        } else if (targetCell.type === 'markdown') {
                            setEditingCellId(targetCell.id);
                        } else {
                            // 处理其他类型的cell（如thinking, image等）
                            setCurrentCell(targetCell.id);
                        }
                    } else {
                        editorLogger.logNavigationBlocked(cell.id, 'code', direction, 'no_target_cell_available');
                    }
                } else {
                    editorLogger.logNavigationBlocked(cell.id, 'code', direction, 'cursor_not_at_boundary');
                }
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                // 检查是否需要跨cell导航（左右）：当光标在文档开头或末尾
                const atStart = event.key === 'ArrowLeft' && isCursorAtDocStart();
                const atEnd = event.key === 'ArrowRight' && isCursorAtDocEnd();
                if (atStart || atEnd) {
                    event.preventDefault();
                    const newIndex = atStart ? currentIndex - 1 : currentIndex + 1;
                    if (newIndex >= 0 && newIndex < cells.length) {
                        const targetCell = cells[newIndex];
                        if (targetCell.type === 'code') {
                            setCurrentCell(targetCell.id);
                        } else if (targetCell.type === 'markdown') {
                            setEditingCellId(targetCell.id);
                        } else {
                            // 处理其他类型的cell（如thinking, image等）
                            setCurrentCell(targetCell.id);
                        }
                    }
                }
            }
        },
        [cell.id, cell.content, cells, handleExecute, setCurrentCell, setEditingCellId, onDelete, isCursorAtFirstLine, isCursorAtLastLine, isCursorAtDocStart, isCursorAtDocEnd]
    );

    // 渲染输出
    const renderOutput = useCallback((output: Output | null) => {
        if (!output) return null;
        try {
            if (output.type === 'image') {
                return (
                    <div
                        key={output.key}
                        className="output-image-container flex justify-center items-center"
                    >
                        <div className="max-w-[80%] flex justify-center">
                            <img
                                src={
                                    typeof output.content === 'string'
                                        ? output.content
                                        : String(output.content)
                                }
                                alt={`Output ${output.key}`}
                                className="max-w-full h-auto object-contain"
                                onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    console.error('Image load error:', e);
                                    img.style.display = 'none';
                                    const errorText = document.createElement('div');
                                    errorText.className = 'text-center text-red-500';
                                    errorText.textContent = 'Image load error';
                                    img.parentNode?.appendChild(errorText);
                                }}
                            />
                        </div>
                    </div>
                );
            }
            if (output.type === 'html') {
                const htmlContent = String(output.content || '');
                return (
                    <div
                        key={output.key}
                        className="output-html-container"
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                );
            }
            if (output.type === 'error' || output.type === 'text') {
                const htmlContent = ansi_up.ansi_to_html(String(output.content || ''));
                return (
                    <pre
                        key={output.key}
                        className={`font-mono text-sm whitespace-pre-wrap break-words ${output.type === 'error' ? 'text-red-500' : ''
                            }`}
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                );
            }
        } catch (error) {
            console.error('Error rendering output:', error);
            return (
                <pre
                    key={`error-${Date.now()}-${Math.random()}`}
                    className="text-red-500"
                >
                    Error rendering output
                </pre>
            );
        }
        return null;
    }, []);

    // 切换显示模式
    const toggleCellMode = useCallback(() => {
        let newMode;
        if (cellMode === DISPLAY_MODES.COMPLETE) {
            newMode = DISPLAY_MODES.CODE_ONLY;
        } else if (cellMode === DISPLAY_MODES.CODE_ONLY) {
            newMode = DISPLAY_MODES.OUTPUT_ONLY;
        } else {
            newMode = DISPLAY_MODES.COMPLETE;
        }
        setCellMode(cell.id, newMode);
    }, [cellMode, cell.id, setCellMode]);

    const renderDisplayModeButton = () => {
        let icon;
        let title;
        switch (cellMode) {
            case DISPLAY_MODES.COMPLETE:
                icon = <Layout className="w-4 h-4" />;
                title = 'Create Mode';
                break;
            case DISPLAY_MODES.CODE_ONLY:
                icon = <Code className="w-4 h-4" />;
                title = 'Code Only';
                break;
            case DISPLAY_MODES.OUTPUT_ONLY:
                icon = <Monitor className="w-4 h-4" />;
                title = 'Output Only';
                break;
            default:
                icon = <Layout className="w-4 h-4" />;
                title = 'Create Mode';
        }
        return (
            <button
                onClick={toggleCellMode}
                className="p-2 hover:bg-gray-200 rounded"
                disabled={(isStepMode && processedOutputs.length > 0) || isDemoMode}
                title={isDemoMode ? 'Mode switching disabled in demo mode' : title}
            >
                {icon}
            </button>
        );
    };

    // 检测是否需要展示 AI Debug 按钮
    const showAIdebug = useMemo(() => {
        return cell.outputs && cell.outputs.length > 0 && cell.outputs[0].content === '[error-message-for-debug]';
    }, [cell.outputs]);

    // 执行按钮
    const renderExecuteButton = useCallback(() => {
        if (isExecuting) {
            return (
                <button
                    onClick={handleCancel}
                    className="p-2 hover:bg-red-600 rounded flex items-center gap-2"
                    disabled={isCancelling}
                    title="Cancel execution"
                >
                    {isCancelling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            <Square className="w-4 h-4" />
                            <span className="text-xs">{formatElapsedTime(elapsedTime)}</span>
                        </>
                    )}
                </button>
            );
        }
        return (
            <button
                onClick={handleExecute}
                className="p-2 hover:bg-yellow-600 rounded"
                title="Execute cell (Ctrl+Enter)"
            >
                <Play className="w-4 h-4" />
            </button>
        );
    }, [isExecuting, isCancelling, elapsedTime, handleCancel, handleExecute, formatElapsedTime]);

    // —— 展开/收缩逻辑 ——
    const EXPAND_THRESHOLD = 200; // 阈值高度
    const [isExpanded, setIsExpanded] = useState(true); // 默认展开
    const [isUserToggled, setIsUserToggled] = useState(false); // 用户是否手动切换过
    const [isHovering, setIsHovering] = useState(false);
    const codeBlockWrapperRef = useRef(null);
    const [contentHeight, setContentHeight] = useState(0);

    // 在独立窗口中强制保持展开状态
    useEffect(() => {
        if (isInDetachedView) {
            setIsExpanded(true);
            setIsUserToggled(true);
        }
    }, [isInDetachedView]);

    // 当有新输出时，自动展开代码区域便于查看
    useEffect(() => {
        if (processedOutputs.length > 0 && !isExpanded && contentHeight > EXPAND_THRESHOLD) {
            setIsExpanded(true);
            setIsUserToggled(true);
        }
    }, [processedOutputs.length, isExpanded, contentHeight]);

    // 当 cell 内容发生较大变化时重置用户切换状态
    const prevContentRef = useRef(cell.content);
    useEffect(() => {
        const currentContent = cell.content || '';
        const prevContent = prevContentRef.current || '';

        // 只有在内容发生显著变化时才重置（比如超过100个字符的差异）
        const contentDiff = Math.abs(currentContent.length - prevContent.length);
        if (contentDiff > 100 || (prevContent && !currentContent)) {
            setIsUserToggled(false);
        }

        prevContentRef.current = currentContent;
    }, [cell.content]);

    // 使用 ResizeObserver 监听代码区域高度变化，添加防抖优化
    useEffect(() => {
        if (!codeBlockWrapperRef.current) return;

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const ro = new ResizeObserver((entries) => {
            // 清除之前的定时器
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            // 设置防抖延迟
            timeoutId = setTimeout(() => {
                for (let entry of entries) {
                    const newHeight = entry.target.scrollHeight;
                    setContentHeight(newHeight);
                    if (!isUserToggled) {
                        if (newHeight > EXPAND_THRESHOLD) {
                            setIsExpanded(false);
                        } else {
                            setIsExpanded(true);
                        }
                    }
                }
            }, 100); // 100ms 防抖延迟
        });

        ro.observe(codeBlockWrapperRef.current);

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            ro.disconnect();
        };
    }, [isUserToggled]);

    // 复制代码
    const handleCopyCode = useCallback(() => {
        navigator.clipboard.writeText(cell.content || '').then(
            () => {
                // 静默复制，不输出日志
            },
            (err) => {
                if (process.env.NODE_ENV === 'development') {
                    console.error('Copy failed:', err);
                }
            }
        );
    }, [cell.content]);

    // 处理收缩时的滚动
    const handleCollapse = useCallback(() => {
        setIsUserToggled(true);
        setIsExpanded(false);

        if (codeContainerRef.current) {
            setTimeout(() => {
                codeContainerRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
            }, 100);
        }
    }, []);

    // DSLC 模式下隐藏工具栏或代码区域
    const shouldHideToolbar = dslcMode;
    const shouldHideCode = dslcMode && processedOutputs.length > 0;

    // 添加执行中占位符
    const renderExecutingPlaceholder = useCallback(() => {
        if (!isExecuting || processedOutputs.length > 0) return null;

        return (
            <div className="p-4 border-t rounded-b-lg flex flex-col items-center justify-center min-h-[100px] bg-gray-50 animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-thme-500" />
                    <div className="text-sm text-gray-600 font-medium">Executing code...</div>
                </div>
                <div className="text-xs text-gray-500">Time elapsed: {formatElapsedTime(elapsedTime)}</div>
            </div>
        );
    }, [isExecuting, processedOutputs.length, elapsedTime, formatElapsedTime]);

    // 增强切换模式效果 - 立即切换到输出模式
    useEffect(() => {
        if (isExecuting && !wasExecuting.current) {
            // 保存当前模式用于执行后恢复
            prevMode.current = cellMode;

            // 立即切换到输出模式，不等待
            if (cellMode !== DISPLAY_MODES.OUTPUT_ONLY) {
                setCellMode(cell.id, DISPLAY_MODES.OUTPUT_ONLY);
            }
        }

        // 记录上一次的执行状态，用于检测状态变化
        wasExecuting.current = isExecuting;
    }, [isExecuting, cellMode, cell.id, setCellMode]);

    // 添加一个新的状态来控制工具栏的显示
    const [showToolbar, setShowToolbar] = useState(false);


    // 紧凑模式渲染
    const renderCompactMode = () => (
        <div
            data-cell-id={cell.id}
            className="code-cell-container bg-white/90 shadow-sm rounded-lg backdrop-blur-sm border-2 border-theme-300"
            ref={codeContainerRef}
            onMouseEnter={() => setShowToolbar(true)}
            onMouseLeave={() => setShowToolbar(false)}
        >
            <div className="flex items-center justify-between p-3 rounded-lg bg-theme-50/50">
                <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-theme-500" />
                    <span className="text-sm font-medium text-theme-700">Cell opened in split view</span>
                    {cell.description && (
                        <div className="flex items-center gap-1">
                            <InfoIcon className="w-3 h-3 text-theme-500" />
                            <span className="text-xs text-theme-600 truncate max-w-[200px]">
                                {cell.description.slice(0, 50)}...
                            </span>
                        </div>
                    )}
                </div>
                <div className={`flex items-center gap-2 transition-opacity duration-200 ${showToolbar ? 'opacity-100' : 'opacity-60'}`}>
                    <button
                        onClick={() => setDetachedCellId(null)}
                        className="p-1.5 hover:bg-theme-200 rounded text-theme-700"
                        title="Return to normal view"
                    >
                        <Minimize2 className="w-4 h-4" />
                    </button>
                    {onDelete && (
                        <button
                            onClick={() => onDelete(cell.id)}
                            className="p-1.5 hover:bg-red-200 rounded text-red-600"
                            title="Delete cell"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    // 如果处于独立窗口模式且不在独立窗口视图中，渲染紧凑模式
    if (isDetached && !isInDetachedView) {
        return renderCompactMode();
    }

    return (
        <div
            data-cell-id={cell.id}
            className={`code-cell-container codeCell ${
                isInDetachedView
                    ? 'bg-white h-full'
                    : 'bg-white/90 shadow-sm rounded-lg backdrop-blur-sm'
            }`}
            ref={codeContainerRef}
            style={{
                width: finished_thinking && dslcMode && showThinking ? 'fit-content' : '',
                height: isInDetachedView ? '100%' : 'auto',
            }}
            onMouseEnter={() => setShowToolbar(true)}
            onMouseLeave={() => setShowToolbar(false)}
        >
            <div
                className={`${isInDetachedView ? 'h-full flex flex-col' : 'mb-4 rounded-xl border hover:shadow-md'} backdrop-blur-md transition-all duration-500 ease-out
                    ${isExecuting ? 'border-yellow-400/50 shadow-lg bg-white/95' : 'bg-white/90 text-black'}
                    ${isTransitioningToOutput ? 'transform scale-y-95 opacity-90' : ''}
                    ${isInDetachedView ? '' : 'hover:shadow-md'}
                `}
                onTransitionEnd={() => {
                    if (isTransitioningToOutput) {
                        setIsTransitioningToOutput(false);
                    }
                }}
            >
                {/* 顶部工具栏 - DSLC 模式下隐藏 */}
                {!shouldHideToolbar && (
                    <div className={`${isInDetachedView ? 'flex-shrink-0' : ''} flex items-center justify-between p-2 ${isInDetachedView ? 'border-b border-gray-200' : 'rounded-t-lg border-none'} transition-opacity duration-200 ${isInDetachedView ? 'opacity-100' : (showToolbar ? 'opacity-100' : 'opacity-0')}`}>
                        <div className="flex items-center gap-2">
                            {renderExecuteButton()}
                            {!isInDetachedView && (
                                <>
                                    <button
                                        onClick={() => {
                                            console.log(`Initializing kernel for cell ${cell.id}`);
                                            useStore.getState().clearAllOutputs();
                                            useCodeStore.getState().restartKernel();
                                        }}
                                        className="p-2 hover:bg-theme-600 rounded"
                                        title="Restart kernel"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleClearOutput}
                                        className="p-2 hover:bg-yellow-600 rounded"
                                        disabled={!processedOutputs.length}
                                        title="Clear outputs"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    {renderDisplayModeButton()}
                                    <button
                                        onClick={() => setDetachedCellId(isDetached ? null : cell.id)}
                                        className={`p-2 hover:bg-theme-600 rounded ${isDetached ? 'bg-theme-500 text-white' : ''}`}
                                        title={isDetached ? "Dock to main view" : "Open in detached window"}
                                    >
                                        {isDetached ? <Minimize2 className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                                    </button>
                                    {onDelete && (
                                        <button
                                            onClick={() => onDelete(cell.id)}
                                            className="p-2 hover:bg-gray-600 rounded text-red-500"
                                            title="Delete cell"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </>
                            )}
                            {isInDetachedView && (
                                <>
                                    <button
                                        onClick={handleClearOutput}
                                        className="p-2 hover:bg-yellow-600 rounded"
                                        disabled={!processedOutputs.length}
                                        title="Clear outputs"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    {/* 在独立窗口中添加切换开关 */}
                                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                        <button
                                            onClick={() => setCellMode(cell.id, DISPLAY_MODES.CODE_ONLY)}
                                            className={`px-3 py-1.5 text-sm rounded transition-colors ${
                                                cellMode === DISPLAY_MODES.CODE_ONLY
                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                            title="Show code only"
                                        >
                                            <Code className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setCellMode(cell.id, DISPLAY_MODES.OUTPUT_ONLY)}
                                            className={`px-3 py-1.5 text-sm rounded transition-colors ${
                                                cellMode === DISPLAY_MODES.OUTPUT_ONLY
                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                            title="Show output only"
                                        >
                                            <Monitor className="w-4 h-4" />
                                        </button>
                                        {/* <button
                                            onClick={() => setCellMode(cell.id, DISPLAY_MODES.COMPLETE)}
                                            className={`px-3 py-1.5 text-sm rounded transition-colors ${
                                                cellMode === DISPLAY_MODES.COMPLETE
                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                            title="Show both code and output"
                                        >
                                            <Layout className="w-4 h-4" />
                                        </button> */}
                                    </div>
                                    {/* 全屏切换按钮 */}
                                    <button
                                        onClick={toggleDetachedCellFullscreen}
                                        className="p-2 hover:bg-gray-200 rounded"
                                        title={isDetachedCellFullscreen ? "Switch to split view" : "Switch to fullscreen"}
                                    >
                                        {isDetachedCellFullscreen ? <Split className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                    </button>
                                    {/* 关闭独立窗口按钮 */}
                                    <button
                                        onClick={() => setDetachedCellId(null)}
                                        className="p-2 hover:bg-red-200 rounded text-red-600"
                                        title="Close detached view"
                                    >
                                        <Minimize2 className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                        {/* 右侧：AI Debug / Tooltip */}
                        <div className="flex items-center gap-2 relative">
                            {cell.description && <button className="peer p-2 text-black rounded-md hover:bg-theme-100">
                                <InfoIcon className="w-4 h-4" />
                            </button>}
                            <div className="absolute top-full right-0 px-5 py-3 rounded-lg opacity-0 peer-hover:opacity-100 transition-opacity w-[320px] break-words invisible peer-hover:visible z-50">
                                <div className="absolute inset-0 rounded-lg shadow-lg">
                                    <div className="absolute inset-0 bg-gradient-to-r from-theme-100/50 via-purple-100/50 to-pink-100/50 animate-gradient" />
                                </div>
                                <div className="relative z-10">
                                    <ReactMarkdown className="text-[15px] leading-relaxed tracking-wide text-gray-800">
                                        {(cell.description || 'no ai description').replace(/(?<!\n)\n(?!\n)/g, '  \n')}
                                    </ReactMarkdown>
                                </div>
                            </div>
                            {showAIdebug && (
                                <button
                                    onClick={() => {
                                        console.log('AI Debug clicked!');
                                        useStore.getState().setCurrentCell(cell.id);
                                        sendCurrentCellExecuteCodeError_should_debug();
                                    }}
                                    className="px-2 py-1 bg-theme-600 text-white rounded-md relative transition-all duration-300 ease-in-out hover:bg-theme-700 hover:ring-2 hover:ring-theme-300 hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-theme-400 shadow-lg"
                                    title="AI Debug"
                                >
                                    <span className="flex items-center gap-1">
                                        <Sparkles size={14} /> Debug
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* 代码块区域：在 DSLC 指令执行时隐藏 */}
                {!shouldHideCode &&
                    (cellMode === DISPLAY_MODES.COMPLETE ||
                        cellMode === DISPLAY_MODES.CODE_ONLY) && (
                        <div
                            className={`relative ${isInDetachedView ? 'flex-1 min-h-0' : ''}`}
                            onMouseEnter={() => setIsHovering(true)}
                            onMouseLeave={() => setIsHovering(false)}
                        >
                            <div
                                className="relative overflow-hidden rounded-lg"
                                style={{
                                    maxHeight: isInDetachedView ? 'none' : (
                                        contentHeight > EXPAND_THRESHOLD
                                            ? isExpanded
                                                ? `${contentHeight}px`
                                                : `${EXPAND_THRESHOLD}px`
                                            : 'none'
                                    ),
                                    transition: isInDetachedView ? 'none' : 'max-height 300ms ease-in-out',
                                    willChange: isInDetachedView ? 'auto' : 'max-height',
                                }}
                            >
                                {/* Copy button - fixed position, show on hover */}
                                <div
                                    className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${isHovering ? 'opacity-100' : 'opacity-0'}`}
                                    style={{
                                        minWidth: '48px',
                                        minHeight: '28px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <button
                                        onClick={handleCopyCode}
                                        className="px-2 py-1 text-xs bg-gray-700/90 text-white rounded hover:bg-gray-600 transition-colors backdrop-blur-sm"
                                        title="Copy code"
                                        style={{
                                            minWidth: '44px',
                                            textAlign: 'center'
                                        }}
                                    >
                                        Copy
                                    </button>
                                </div>

                                <div
                                    className={`${isInDetachedView ? 'h-full' : 'h-full'} overflow-auto`}
                                    ref={codeBlockWrapperRef}
                                >
                                    <CodeMirror
                                        value={typeof cell.content === 'string' ? cell.content : String(cell.content || '')}
                                        height={isInDetachedView ? "100%" : "auto"}
                                        extensions={[python()]}
                                        onChange={handleChange}
                                        onKeyDown={handleKeyDown}
                                        theme={dracula}
                                        style={{
                                            fontSize: '16px',
                                            lineHeight: '1.5',
                                            height: isInDetachedView ? '100%' : 'auto',
                                        }}
                                        readOnly={isExecuting || dslcMode}
                                        autoFocus={isCurrentCell && !dslcMode}
                                        ref={editorRef}
                                    />
                                    {isExecuting && !processedOutputs.length && (
                                        <div className="absolute inset-0 bg-gray-800/50 flex items-center justify-center rounded-b-lg">
                                            <Loader2 className="w-16 h-16 animate-spin text-red-500" />
                                        </div>
                                    )}
                                </div>

                                {/* Expand/Collapse button - 独立窗口中隐藏 */}
                                {!isInDetachedView && contentHeight > EXPAND_THRESHOLD && (
                                    <div
                                        className={`absolute bottom-0 left-0 right-0 flex justify-center items-center z-30 transition-opacity duration-200 ${isHovering ? 'opacity-100' : 'opacity-0'}`}
                                    >
                                        {!isExpanded ? (
                                            <button
                                                onClick={() => {
                                                    setIsUserToggled(true);
                                                    setIsExpanded(true);
                                                }}
                                                className="px-4 py-1.5 text-sm bg-gray-900/90 text-white rounded-t-lg shadow-lg hover:bg-gray-800 transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-theme-500 flex items-center gap-1"
                                                title="Expand"
                                            >
                                                <span>Expand</span>
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setIsUserToggled(true);
                                                    setIsExpanded(false);
                                                    handleCollapse();
                                                }}
                                                className="px-4 py-1.5 text-sm bg-gray-900/90 text-white rounded-t-lg shadow-lg hover:bg-gray-800 transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-theme-500 flex items-center gap-1"
                                                title="Collapse"
                                            >
                                                <span>Collapse</span>
                                                <ChevronUp className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Gradient overlay for collapsed state - 独立窗口中隐藏 */}
                                {!isInDetachedView && !isExpanded && contentHeight > EXPAND_THRESHOLD && (
                                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-800 to-transparent pointer-events-none"></div>
                                )}
                            </div>
                        </div>
                    )}

                {/* 输出区域 - 添加执行状态标签和动画 */}
                {(cellMode === DISPLAY_MODES.COMPLETE || cellMode === DISPLAY_MODES.OUTPUT_ONLY || shouldHideCode) && (
                    <div className={`${isInDetachedView ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
                        {/* 执行中占位符 */}
                        {renderExecutingPlaceholder()}

                        {/* 实际输出内容 */}
                        <div
                            onClick={() => setShowThinking(!showThinking)}
                            className={`${isInDetachedView ? 'flex-1 min-h-0 overflow-auto' : ''}`}
                        >
                            {finished_thinking && dslcMode && showThinking ? (
                                <div className="flex flex-col justify-center px-2"
                                >
                                    <div className="flex items-center gap-2 p-1"
                                    style={{
                                        width: 'fit-content',
                                    }}
                                    >
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                        <span className="text-sm text-gray-600 font-medium">{thinkingText}</span>
                                    </div>
                                </div>
                            ) :
                                (processedOutputs.length > 0 && (
                                    <div
                                        className={`p-4 rounded-b-lg space-y-4 output-container relative transition-all duration-300 ease-in-out ${outputVisible ? 'opacity-100' : 'opacity-0'}`}
                                        key={`output-${processedOutputs.length}-${outputUpdateKey}`}
                                    >
                                        <div className="relative">
                                            {isExecuting && cellMode !== DISPLAY_MODES.OUTPUT_ONLY && (
                                                <div className="absolute -top-2 right-0 flex items-center gap-1 text-xs bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">
                                                    <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                                                    <span className="text-yellow-700">Running</span>
                                                </div>
                                            )}

                                            {processedOutputs.map((output, index) => (
                                                <div
                                                    key={`${output.key}-${outputUpdateKey}`}
                                                    className="transition-all duration-300"
                                                    style={{
                                                        opacity: outputVisible ? 1 : 0,
                                                        transform: outputVisible ? 'translateY(0)' : 'translateY(8px)',
                                                        transition: `opacity 300ms ease-out ${index * 50}ms, transform 300ms ease-out ${index * 50}ms`
                                                    }}
                                                >
                                                    {renderOutput(output)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default React.memo(CodeCell);
