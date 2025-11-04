import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Maximize2, Minimize2, RefreshCw, Settings, Code, Globe, FolderOpen } from 'lucide-react';
import { define } from 'codesandbox/lib/api/define';
import useStore from '../../../../store/notebookStore';
import { deriveSandboxUrlFromProjectPath } from './webviewUtils';

interface CodeSandboxWebViewProps {
    projectPath: string;
    projectType: 'html' | 'react' | 'javascript' | 'typescript' | 'vue' | 'angular';
    title?: string;
    onProjectChange?: (projectPath: string) => void;
}

interface SandboxFiles {
    [key: string]: {
        content: string;
        isBinary?: boolean;
    };
}

interface ProjectConfig {
    files: SandboxFiles;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    template: string;
    entry: string[];
}

const CodeSandboxWebView: React.FC<CodeSandboxWebViewProps> = ({
    projectPath,
    projectType,
    title,
    onProjectChange
}) => {
    const [sandboxUrl, setSandboxUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
    const [isPreviewMode, setIsPreviewMode] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Store integration
    const setDetachedCellId = useStore(s => s.setDetachedCellId);
    const isDetachedCellFullscreen = useStore(s => s.isDetachedCellFullscreen);
    const toggleDetachedCellFullscreen = useStore(s => s.toggleDetachedCellFullscreen);

    // 获取项目模板
    const getTemplate = (type: string): string => {
        const templates = {
            'react': 'create-react-app',
            'typescript': 'create-react-app-typescript',
            'vue': 'vue-cli',
            'angular': '@angular/cli',
            'html': 'static',
            'javascript': 'vanilla'
        };
        return templates[type as keyof typeof templates] || 'static';
    };

    // 从后端获取项目文件结构
    const fetchProjectFiles = async (path: string): Promise<ProjectConfig> => {
        try {
            const response = await fetch('/api/sandbox/scan-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    projectPath: path,
                    projectType: projectType 
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to scan project: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                files: data.files || {},
                dependencies: data.dependencies || {},
                devDependencies: data.devDependencies || {},
                template: getTemplate(projectType),
                entry: data.entry || ['src/index.js']
            };
        } catch (err) {
            console.error('Failed to fetch project files:', err);
            throw err;
        }
    };

    // 创建项目预览
    const createSandboxPreview = async (config: ProjectConfig) => {
        try {
            console.log('🚀 Creating project preview with config:', {
                template: config.template,
                fileCount: Object.keys(config.files).length,
                files: Object.keys(config.files),
                projectPath,
                projectType
            });

            // 检查是否是HTML多文件项目
            if (projectType === 'html' && Object.keys(config.files).some(path => path.includes('/'))) {
                console.log('📁 Detected multi-file HTML project, using backend assembly');
                
                // 从项目路径提取notebook ID和项目名称
                const pathParts = projectPath.split('/');
                const notebookIndex = pathParts.findIndex(part => part.length === 32); // notebook ID长度
                
                if (notebookIndex !== -1) {
                    const notebookId = pathParts[notebookIndex];
                    const projectName = pathParts[pathParts.length - 1];
                    
                    // 使用本地静态服务提供完整多文件项目
                    const derived = deriveSandboxUrlFromProjectPath(projectPath) || `/sandbox/${notebookId}/${projectName}/`;
                    console.log('✅ Using local static sandbox URL:', derived);

                    setSandboxUrl(derived);
                    return;
                }
            }

            // 回退到CodeSandbox方案
            console.log('🔄 Falling back to CodeSandbox');
            
            // 使用 codesandbox define API 创建沙盒 URL
            const parameters = define({
                files: config.files,
                template: config.template,
                dependencies: config.dependencies,
                devDependencies: config.devDependencies
            });

            // 构建完整的 CodeSandbox URL
            const baseUrl = 'https://codesandbox.io/api/v1/sandboxes/define';
            const embedUrl = `${baseUrl}?parameters=${parameters}&view=preview&fontsize=14&hidenavigation=1&theme=dark`;
            
            setSandboxUrl(embedUrl);
        } catch (err) {
            console.error('Failed to create project preview:', err);
            throw err;
        }
    };

    // 初始化项目预览
    const initializePreview = async () => {
        if (!projectPath) return;

        setIsLoading(true);
        setError(null);

        try {
            // 1. 扫描项目文件
            const config = await fetchProjectFiles(projectPath);
            setProjectConfig(config);

            // 2. 创建 CodeSandbox 预览
            await createSandboxPreview(config);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(errorMessage);
            console.error('Failed to initialize preview:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 刷新预览
    const refreshPreview = () => {
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    // 在新标签页打开完整编辑器
    const openInCodeSandbox = () => {
        if (!projectConfig) return;

        try {
            const parameters = define({
                files: projectConfig.files,
                template: projectConfig.template,
                dependencies: projectConfig.dependencies,
                devDependencies: projectConfig.devDependencies
            });

            const fullUrl = `https://codesandbox.io/api/v1/sandboxes/define?parameters=${parameters}`;
            window.open(fullUrl, '_blank');
        } catch (err) {
            console.error('Failed to open in CodeSandbox:', err);
        }
    };

    // 切换预览/编辑模式
    const toggleMode = () => {
        if (!projectConfig) return;

        const newMode = !isPreviewMode;
        setIsPreviewMode(newMode);

        try {
            const parameters = define({
                files: projectConfig.files,
                template: projectConfig.template,
                dependencies: projectConfig.dependencies,
                devDependencies: projectConfig.devDependencies
            });

            const view = newMode ? 'preview' : 'editor';
            const embedUrl = `https://codesandbox.io/api/v1/sandboxes/define?parameters=${parameters}&view=${view}&fontsize=14&hidenavigation=1&theme=dark`;
            
            setSandboxUrl(embedUrl);
        } catch (err) {
            console.error('Failed to toggle mode:', err);
        }
    };

    useEffect(() => {
        initializePreview();
    }, [projectPath, projectType]);

    const getProjectTypeIcon = () => {
        const icons = {
            'react': <Code className="w-4 h-4 text-blue-500" />,
            'vue': <Code className="w-4 h-4 text-green-500" />,
            'angular': <Code className="w-4 h-4 text-red-500" />,
            'typescript': <Code className="w-4 h-4 text-blue-600" />,
            'html': <Globe className="w-4 h-4 text-orange-500" />,
            'javascript': <Code className="w-4 h-4 text-yellow-500" />
        };
        return icons[projectType as keyof typeof icons] || <FolderOpen className="w-4 h-4" />;
    };

    const getProjectTypeColor = () => {
        const colors = {
            'react': 'bg-blue-100 text-blue-800',
            'vue': 'bg-green-100 text-green-800',
            'angular': 'bg-red-100 text-red-800',
            'typescript': 'bg-indigo-100 text-indigo-800',
            'html': 'bg-orange-100 text-orange-800',
            'javascript': 'bg-yellow-100 text-yellow-800'
        };
        return colors[projectType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
    };

    const getProjectInfo = () => {
        if (!projectConfig) return null;
        
        const fileCount = Object.keys(projectConfig.files).length;
        const depCount = Object.keys(projectConfig.dependencies).length;
        
        return { fileCount, depCount };
    };

    const projectInfo = getProjectInfo();

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                <div className="flex items-center gap-2">
                    {getProjectTypeIcon()}
                    <div className="text-sm font-medium text-gray-700 truncate">
                        {title || `${projectType.charAt(0).toUpperCase() + projectType.slice(1)} Project`}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded ${getProjectTypeColor()}`}>
                        {projectType.toUpperCase()}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* 项目信息 */}
                    {projectInfo && (
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{projectInfo.fileCount} files</span>
                            <span>{projectInfo.depCount} deps</span>
                        </div>
                    )}

                    {/* 控制按钮 */}
                    <div className="flex items-center gap-1 border-l border-gray-300 pl-2">
                        <button
                            onClick={toggleMode}
                            disabled={!sandboxUrl || isLoading}
                            className={`px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                                isPreviewMode 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-blue-100 text-blue-700'
                            }`}
                            title={isPreviewMode ? "Switch to editor" : "Switch to preview"}
                        >
                            {isPreviewMode ? 'Preview' : 'Editor'}
                        </button>

                        <button
                            onClick={refreshPreview}
                            disabled={!sandboxUrl || isLoading}
                            className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                            onClick={openInCodeSandbox}
                            disabled={!projectConfig}
                            className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50"
                            title="Open in CodeSandbox"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </button>

                        <button
                            onClick={toggleDetachedCellFullscreen}
                            className="p-1.5 hover:bg-gray-200 rounded"
                            title={isDetachedCellFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        >
                            {isDetachedCellFullscreen ? 
                                <Minimize2 className="w-4 h-4" /> : 
                                <Maximize2 className="w-4 h-4" />
                            }
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative">
                {error ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <div className="text-red-500 mb-4">
                            <Settings className="w-12 h-12" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load project</h3>
                        <p className="text-gray-600 mb-4 max-w-md">{error}</p>
                        <div className="flex gap-2">
                            <button
                                onClick={initializePreview}
                                className="px-4 py-2 bg-theme-500 text-white rounded hover:bg-theme-600 transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={() => onProjectChange?.('')}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                            >
                                Select Different Project
                            </button>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full p-8">
                        <div className="animate-spin mb-4">
                            <RefreshCw className="w-8 h-8 text-theme-500" />
                        </div>
                        <p className="text-gray-600 mb-2">Loading project...</p>
                        <div className="text-sm text-gray-500">
                            Scanning {projectType} project structure
                        </div>
                    </div>
                ) : sandboxUrl ? (
                    <iframe
                        ref={iframeRef}
                        src={sandboxUrl}
                        className="w-full h-full border-none"
                        title={`CodeSandbox: ${title || projectType}`}
                        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full p-8 text-gray-500">
                        <div className="text-center">
                            <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p className="mb-2">No project selected</p>
                            <button
                                onClick={() => onProjectChange?.('')}
                                className="text-theme-500 hover:text-theme-600 text-sm underline"
                            >
                                Choose a project to preview
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
                <div className="flex items-center gap-4">
                    <div>Path: {projectPath || 'None'}</div>
                    <div>Mode: {isPreviewMode ? 'Preview' : 'Editor'}</div>
                </div>
                <div className="flex items-center gap-2">
                    {isLoading ? (
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                            <span>Loading</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                            <span>Error</span>
                        </div>
                    ) : sandboxUrl ? (
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            <span>Ready</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            <span>Idle</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CodeSandboxWebView;