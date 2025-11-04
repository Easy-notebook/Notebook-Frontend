import React, { useState, useEffect, useRef } from 'react';
import { Trash2, ExternalLink, Minimize2, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import useStore from '../../../store/notebookStore';

interface AIThinkingCellProps {
    cell: {
        id: string;
        content?: string;
        agentName?: string;
        customText?: string;
        textArray?: string[];
        useWorkflowThinking?: boolean; // Keep for compatibility but not used
    };
    onDelete?: (cellId: string) => void;
    isInDetachedView?: boolean;
}

const AIThinkingCell: React.FC<AIThinkingCellProps> = ({ 
    cell, 
    onDelete, 
    isInDetachedView = false 
}) => {
    const [isExpanded, setIsExpanded] = useState(false); // 默认收起状态
    const [seconds, setSeconds] = useState(0);
    const [rotation, setRotation] = useState(0);
    const [opacity, setOpacity] = useState(1);
    const [textIndex, setTextIndex] = useState(0);
    const [workflowThinkingTexts, setWorkflowThinkingTexts] = useState([]);
    const [showToolbar, setShowToolbar] = useState(false);
    // 保存 requestAnimationFrame 返回的句柄（number）
    const animationRef = useRef<number | null>(null);
    
    const { 
        detachedCellId, 
        setDetachedCellId,
    } = useStore();
    
    const isDetached = detachedCellId === cell.id;

    // Extract props from cell
    const agentName = cell.agentName || "AI";
    const customText = cell.customText || null;
    const textArray = cell.textArray || [];

    // 处理时间计数
    useEffect(() => {
        const timer = setInterval(() => {
            setSeconds(prev => prev + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // 使用requestAnimationFrame处理旋转动画，实现更平滑的顺时针旋转
    useEffect(() => {
        const animate = () => {
            setRotation(prev => (prev + 1) % 360);
            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    // 处理脉动效果
    useEffect(() => {
        const pulseTimer = setInterval(() => {
            setOpacity(prev => prev === 1 ? 0.8 : 1);
        }, 800);

        return () => clearInterval(pulseTimer);
    }, []);

    // 处理文本切换
    useEffect(() => {
        if (textArray && textArray.length > 1) {
            const textSwitchTimer = setInterval(() => {
                setTextIndex(prev => (prev + 1) % textArray.length);
            }, 3000); // 每3秒切换一次文本

            return () => clearInterval(textSwitchTimer);
        }
    }, [textArray]);

    // Update workflow thinking texts - use textArray for all thinking texts
    useEffect(() => {
        if (textArray && textArray.length > 0) {
            setWorkflowThinkingTexts(textArray);
        }
    }, [textArray]);

    // 确定显示的文本
    const displayText = () => {
        if (customText) {
            return customText;
        } else if (workflowThinkingTexts.length > 0) {
            return workflowThinkingTexts[textIndex % workflowThinkingTexts.length];
        } else if (textArray && textArray.length > 0) {
            return textArray[textIndex % textArray.length];
        } else {
            return `${agentName} agent is thinking`;
        }
    };

    // 控制背景流动效果
    const [gradientPosition, setGradientPosition] = useState(0);
    // 保存背景动画的 requestAnimationFrame 句柄
    const animationFrameRef = useRef<number | null>(null);
    const lastTimeRef = useRef(0);
    const speedRef = useRef(0.05); // 每毫秒移动的像素

    // 使用requestAnimationFrame实现更平滑的背景流动效果
    useEffect(() => {
        const animate = (timestamp) => {
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const deltaTime = timestamp - lastTimeRef.current;
            lastTimeRef.current = timestamp;

            // 更平滑地更新位置
            setGradientPosition(prev => {
                const newPosition = prev - speedRef.current * deltaTime;
                // 确保值在0-200之间循环
                return ((newPosition % 200) + 200) % 200;
            });

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // 紧凑模式渲染
    const renderCompactMode = () => (
        <div
            data-cell-id={cell.id}
            className="thinking-cell-container bg-white/90 shadow-sm rounded-lg backdrop-blur-sm border-2 border-green-300"
            onMouseEnter={() => setShowToolbar(true)}
            onMouseLeave={() => setShowToolbar(false)}
        >
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50/50">
                <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">AI Thinking Cell opened in split view</span>
                </div>
                <div className={`flex items-center gap-2 transition-opacity duration-200 ${showToolbar ? 'opacity-100' : 'opacity-60'}`}>
                    <button
                        onClick={() => setDetachedCellId(null)}
                        className="p-1.5 hover:bg-green-200 rounded text-green-700"
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

    // 收起状态的渲染
    if (!isExpanded && !isInDetachedView) {
        return (
            <div
                data-cell-id={cell.id}
                className="thinking-cell-container bg-white/90 shadow-sm rounded-lg backdrop-blur-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200"
                onMouseEnter={() => setShowToolbar(true)}
                onMouseLeave={() => setShowToolbar(false)}
            >
                <div 
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 transition-colors duration-200"
                    onClick={() => setIsExpanded(true)}
                >
                    {/* 展开图标 */}
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 chevron-icon" />
                    
                    {/* AI 图标 */}
                    <div className="flex-shrink-0">
                        <Brain className="w-4 h-4 text-green-500" />
                    </div>
                    
                    {/* 思考状态文本 */}
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm font-medium text-gray-700">
                            {customText || `${agentName} Thinking`}
                        </span>
                        
                        {/* 动态旋转的加载指示器 */}
                        <div className="w-4 h-4 relative">
                            <div
                                className="absolute inset-0 border-2 rounded-full border-transparent"
                                style={{
                                    borderLeftColor: '#41B883',
                                    borderTopColor: '#3490DC',
                                    transform: `rotate(${rotation}deg)`
                                }}
                            />
                        </div>
                        
                        {/* 时间显示 */}
                        <span className="text-xs text-gray-500">{seconds}s</span>
                        
                        {/* 动态省略号 */}
                        <span className="text-sm text-gray-500">
                            {'.'.repeat(1 + (seconds % 3))}
                        </span>
                        
                        {/* 如果有动态文本数组，显示提示 */}
                        {textArray && textArray.length > 1 && (
                            <span className="text-xs text-gray-400 ml-2">
                                ({textArray.length} states)
                            </span>
                        )}
                    </div>
                    
                    {/* 工具栏 */}
                    {showToolbar && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {onDelete && (
                                <button
                                    onClick={() => onDelete(cell.id)}
                                    className="p-1.5 hover:bg-red-100 rounded text-red-600 transition-colors"
                                    title="Delete cell"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            data-cell-id={cell.id}
            className={`thinking-cell-container expanded ${
                isInDetachedView 
                    ? 'bg-white h-full' 
                    : 'bg-white/90 shadow-sm rounded-lg backdrop-blur-sm'
            }`}
            onMouseEnter={() => setShowToolbar(true)}
            onMouseLeave={() => setShowToolbar(false)}
        >
            {/* Toolbar */}
            {showToolbar && !isInDetachedView && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 p-1 z-20">
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
                        title="Collapse"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                    {!isDetached && (
                        <button
                            onClick={() => setDetachedCellId(cell.id)}
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
                            title="Open in split view"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={() => onDelete(cell.id)}
                            className="p-1.5 hover:bg-red-100 rounded text-red-600"
                            title="Delete cell"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            {/* AI Thinking 内容区域 */}
            <div className="w-full relative overflow-hidden rounded-full">
                    {/* 流动渐变效果的整行背景 - 从右向左流动，无过渡以避免卡顿 */}
                    <div
                        className="absolute inset-0 w-full h-full"
                        style={{
                            background: `linear-gradient(90deg, 
                            rgba(255,255,255,0) 0%, 
                            rgba(65,184,131,0.08) 20%, 
                            rgba(52,144,220,0.12) 50%, 
                            rgba(101,116,205,0.08) 80%, 
                            rgba(255,255,255,0) 100%)`,
                            backgroundSize: '200% 100%',
                            backgroundPosition: `${gradientPosition}% 0%`
                        }}
                    />

                    {/* 指示器容器 */}
                    <div className="w-full flex items-center justify-start relative z-10">
                        <div className="inline-flex items-center px-3 py-1 rounded-full"
                            style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                                border: '1px solid #41B883',
                                opacity: opacity,
                                transition: 'opacity 0.3s ease'
                            }}>
                            {/* 旋转的加载指示器 */}
                            <div className="mr-2 flex-shrink-0">
                                <div className="w-4 h-4 relative">
                                    <div
                                        className="absolute inset-0 border-2 rounded-full border-transparent"
                                        style={{
                                            borderLeftColor: '#41B883',
                                            borderTopColor: '#3490DC',
                                            transform: `rotate(${rotation}deg)`
                                        }}
                                    />
                                </div>
                            </div>

                            {/* 文本部分 */}
                            <div className="flex items-center">
                                <span
                                    className="text-xs font-medium"
                                    style={{ color: '#41B883' }}
                                >
                                    {displayText()}
                                    <span className="inline-block ml-1">
                                        {'.'.repeat(1 + (seconds % 3))}
                                    </span>
                                </span>

                                {/* 显示思考时间 */}
                                <span
                                    className="text-xs ml-2 font-medium"
                                    style={{ color: '#3490DC' }}
                                >
                                    {seconds}s
                                </span>
                            </div>
                        </div>
                    </div>
             </div>
        </div>
    );
};

export default AIThinkingCell;