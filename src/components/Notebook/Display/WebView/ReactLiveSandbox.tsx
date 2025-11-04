import React, { useState, useEffect } from 'react';
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';
import { Minimize2, Maximize2, Split, Code, Monitor, Play, RefreshCw } from 'lucide-react';
import useStore from '../../../../store/notebookStore';

interface ReactLiveSandboxProps {
    code: string;
    fileName?: string;
    language?: 'jsx' | 'html' | 'css' | 'javascript';
    scope?: Record<string, any>;
    onCodeChange?: (code: string) => void;
}

const ReactLiveSandbox: React.FC<ReactLiveSandboxProps> = ({
    code,
    fileName,
    language = 'jsx',
    scope = {},
    onCodeChange
}) => {
    const [currentCode, setCurrentCode] = useState(code);
    const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
    const [isExecuting, setIsExecuting] = useState(false);

    // Store functions for fullscreen control
    const setDetachedCellId = useStore(s => s.setDetachedCellId);
    const isDetachedCellFullscreen = useStore(s => s.isDetachedCellFullscreen);
    const toggleDetachedCellFullscreen = useStore(s => s.toggleDetachedCellFullscreen);

    // Default scope with common React components and utilities
    const defaultScope = {
        React,
        useState: React.useState,
        useEffect: React.useEffect,
        useCallback: React.useCallback,
        useMemo: React.useMemo,
        useRef: React.useRef,
        // Add common UI components
        Button: ({ children, onClick, className = '', ...props }: any) => (
            <button
                onClick={onClick}
                className={`px-4 py-2 bg-theme-500 text-white rounded hover:bg-theme-600 transition-colors ${className}`}
                {...props}
            >
                {children}
            </button>
        ),
        Card: ({ children, className = '', ...props }: any) => (
            <div className={`bg-white rounded-lg shadow-md p-4 ${className}`} {...props}>
                {children}
            </div>
        ),
        Input: ({ className = '', ...props }: any) => (
            <input
                className={`px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-theme-500 ${className}`}
                {...props}
            />
        ),
        ...scope
    };

    useEffect(() => {
        setCurrentCode(code);
    }, [code]);

    const handleCodeChange = (newCode: string) => {
        setCurrentCode(newCode);
        onCodeChange?.(newCode);
    };

    const executeCode = () => {
        setIsExecuting(true);
        // Simulate execution delay
        setTimeout(() => {
            setIsExecuting(false);
        }, 500);
    };

    const resetCode = () => {
        setCurrentCode(code);
        onCodeChange?.(code);
    };

    const getViewModeConfig = () => {
        switch (viewMode) {
            case 'editor':
                return { showEditor: true, showPreview: false };
            case 'preview':
                return { showEditor: false, showPreview: true };
            default:
                return { showEditor: true, showPreview: true };
        }
    };

    const { showEditor: displayEditor, showPreview: displayPreview } = getViewModeConfig();

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
            {/* Header with controls */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-gray-700 truncate">
                        {fileName || `React ${language.toUpperCase()} Sandbox`}
                    </div>
                    {language === 'jsx' && (
                        <span className="px-2 py-1 text-xs bg-theme-100 text-theme-800 rounded">
                            React Live
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* View mode toggle */}
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('editor')}
                            className={`px-2 py-1 text-sm rounded transition-colors ${
                                viewMode === 'editor'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Editor only"
                        >
                            <Code className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('split')}
                            className={`px-2 py-1 text-sm rounded transition-colors ${
                                viewMode === 'split'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Split view"
                        >
                            <Split className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('preview')}
                            className={`px-2 py-1 text-sm rounded transition-colors ${
                                viewMode === 'preview'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Preview only"
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Action buttons */}
                    <button
                        onClick={executeCode}
                        disabled={isExecuting}
                        className="p-1.5 hover:bg-green-100 rounded text-green-600 disabled:opacity-50"
                        title="Execute code"
                    >
                        {isExecuting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4" />
                        )}
                    </button>

                    <button
                        onClick={resetCode}
                        className="p-1.5 hover:bg-gray-200 rounded"
                        title="Reset to original"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                        onClick={toggleDetachedCellFullscreen}
                        className="p-1.5 hover:bg-gray-200 rounded"
                        title={isDetachedCellFullscreen ? "Switch to split view" : "Switch to fullscreen"}
                    >
                        {isDetachedCellFullscreen ? <Split size={16} /> : <Maximize2 size={16} />}
                    </button>

                    <button
                        onClick={() => setDetachedCellId(null)}
                        className="p-1.5 hover:bg-red-200 rounded text-red-600"
                        title="Close sandbox"
                    >
                        <Minimize2 size={16} />
                    </button>
                </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex min-h-0">
                <LiveProvider
                    code={currentCode}
                    scope={defaultScope}
                    noInline={true}
                >
                    {/* Editor panel */}
                    {displayEditor && (
                        <div className={`${displayPreview ? 'w-1/2' : 'w-full'} flex flex-col border-r border-gray-200`}>
                            <div className="flex-1 relative">
                                <LiveEditor
                                    onChange={handleCodeChange}
                                    style={{
                                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        height: '100%',
                                        overflow: 'auto',
                                        padding: '16px',
                                        backgroundColor: '#f8f9fa',
                                        border: 'none',
                                        outline: 'none',
                                        resize: 'none'
                                    }}
                                />
                            </div>
                            {/* Error display */}
                            <div className="border-t border-gray-200 bg-red-50 min-h-[40px] max-h-[120px] overflow-auto">
                                <LiveError
                                    style={{
                                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                                        fontSize: '12px',
                                        color: '#dc2626',
                                        padding: '8px 16px',
                                        margin: 0,
                                        backgroundColor: 'transparent',
                                        border: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Preview panel */}
                    {displayPreview && (
                        <div className={`${displayEditor ? 'w-1/2' : 'w-full'} flex flex-col`}>
                            <div className="flex-1 p-4 overflow-auto bg-white">
                                <LivePreview
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </LiveProvider>
            </div>
        </div>
    );
};

export default ReactLiveSandbox;
