import React, { useState, useCallback } from 'react';
import { FolderOpen, FileText, Code, Globe, Layers, Settings } from 'lucide-react';
import CodeSandboxWebView from './CodeSandboxWebView';
import ReactLiveSandbox from './ReactLiveSandbox';

interface WebViewManagerProps {
    initialPath?: string;
    initialType?: 'project' | 'file';
}

interface ProjectItem {
    path: string;
    name: string;
    type: 'project' | 'file';
    projectType?: 'html' | 'react' | 'javascript' | 'typescript' | 'vue' | 'angular';
    size?: number;
    lastModified?: string;
}

const WebViewManager: React.FC<WebViewManagerProps> = ({
    initialPath,
    initialType = 'project'
}) => {
    const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(
        initialPath ? {
            path: initialPath,
            name: initialPath.split('/').pop() || 'Project',
            type: initialType,
            projectType: detectProjectType(initialPath)
        } : null
    );
    const [isProjectBrowser, setIsProjectBrowser] = useState(!selectedItem);
    const [availableProjects, setAvailableProjects] = useState<ProjectItem[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);

    // 检测项目类型
    function detectProjectType(path: string): 'html' | 'react' | 'javascript' | 'typescript' | 'vue' | 'angular' {
        const pathLower = path.toLowerCase();
        if (path.includes('package.json') || pathLower.includes('react')) return 'react';
        if (pathLower.includes('vue')) return 'vue';
        if (pathLower.includes('angular')) return 'angular';
        if (pathLower.includes('.ts') || pathLower.includes('typescript')) return 'typescript';
        if (pathLower.includes('.html')) return 'html';
        return 'javascript';
    }

    // 扫描可用项目
    const scanAvailableProjects = useCallback(async () => {
        setIsLoadingProjects(true);
        try {
            const response = await fetch('/api/sandbox/scan-available-projects', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                setAvailableProjects(data.projects || []);
            } else {
                console.error('Failed to scan projects:', response.statusText);
            }
        } catch (error) {
            console.error('Error scanning projects:', error);
        } finally {
            setIsLoadingProjects(false);
        }
    }, []);

    // 选择项目
    const selectProject = useCallback((project: ProjectItem) => {
        setSelectedItem(project);
        setIsProjectBrowser(false);
    }, []);

    // 返回项目浏览器
    const backToProjects = useCallback(() => {
        setIsProjectBrowser(true);
        scanAvailableProjects();
    }, [scanAvailableProjects]);

    // 处理项目路径更改
    const handleProjectChange = useCallback((newPath: string) => {
        if (newPath) {
            const newProject: ProjectItem = {
                path: newPath,
                name: newPath.split('/').pop() || 'Project',
                type: 'project',
                projectType: detectProjectType(newPath)
            };
            selectProject(newProject);
        } else {
            backToProjects();
        }
    }, [selectProject, backToProjects]);

    // 渲染项目浏览器
    const renderProjectBrowser = () => (
        <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-gray-600" />
                    <h2 className="text-sm font-medium text-gray-900">Project Browser</h2>
                </div>
                <button
                    onClick={scanAvailableProjects}
                    disabled={isLoadingProjects}
                    className="p-2 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50"
                    title="Refresh projects"
                >
                    <Settings className={`w-4 h-4 ${isLoadingProjects ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {isLoadingProjects ? (
                    <div className="flex items-center justify-center h-full p-8">
                        <div className="text-center">
                            <Settings className="w-8 h-8 mx-auto mb-4 text-gray-400 animate-spin" />
                            <p className="text-gray-600">Scanning for projects...</p>
                        </div>
                    </div>
                ) : availableProjects.length > 0 ? (
                    <div className="p-4 space-y-2">
                        {availableProjects.map((project) => (
                            <ProjectCard
                                key={project.path}
                                project={project}
                                onSelect={selectProject}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full p-8 text-center">
                        <div>
                            <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No Projects Found</h3>
                            <p className="text-gray-600 mb-4">
                                No compatible projects were found in the current workspace.
                            </p>
                            <button
                                onClick={scanAvailableProjects}
                                className="px-4 py-2 bg-theme-500 text-white rounded hover:bg-theme-600 transition-colors"
                            >
                                Scan Again
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // 渲染WebView
    const renderWebView = () => {
        if (!selectedItem) return null;

        // 根据项目类型选择合适的预览器
        if (selectedItem.type === 'file') {
            // 单个文件使用内置预览器
            return (
                <ReactLiveSandbox
                    code={`<!-- Loading ${selectedItem.name} -->`}
                    fileName={selectedItem.name}
                    language="html"
                    onCodeChange={(code) => console.log('Code changed:', code)}
                />
            );
        }

        // 对于完整项目：HTML/React/Vue/等 -> 使用 CodeSandboxWebView
        return (
            <CodeSandboxWebView
                projectPath={selectedItem.path}
                projectType={selectedItem.projectType || 'javascript'}
                title={selectedItem.name}
                onProjectChange={handleProjectChange}
            />
        );
    };

    // 初始化时扫描项目
    React.useEffect(() => {
        if (isProjectBrowser) {
            scanAvailableProjects();
        }
    }, [isProjectBrowser, scanAvailableProjects]);

    return (
        <div className="flex flex-col h-full">
            {/* Navigation bar */}
            {selectedItem && !isProjectBrowser && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200">
                    <button
                        onClick={backToProjects}
                        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                    >
                        <FolderOpen className="w-4 h-4" />
                        Projects
                    </button>
                    <span className="text-gray-400">/</span>
                    <span className="text-sm font-medium text-gray-900">{selectedItem.name}</span>
                </div>
            )}

            {/* Content */}
            <div className="flex-1">
                {isProjectBrowser ? renderProjectBrowser() : renderWebView()}
            </div>
        </div>
    );
};

// 项目卡片组件
interface ProjectCardProps {
    project: ProjectItem;
    onSelect: (project: ProjectItem) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onSelect }) => {
    const getProjectIcon = () => {
        switch (project.projectType) {
            case 'react':
                return <Code className="w-5 h-5 text-blue-500" />;
            case 'vue':
                return <Code className="w-5 h-5 text-green-500" />;
            case 'angular':
                return <Code className="w-5 h-5 text-red-500" />;
            case 'typescript':
                return <Code className="w-5 h-5 text-blue-600" />;
            case 'html':
                return <Globe className="w-5 h-5 text-orange-500" />;
            default:
                return project.type === 'project' ? 
                    <Layers className="w-5 h-5 text-gray-500" /> :
                    <FileText className="w-5 h-5 text-gray-500" />;
        }
    };

    const getProjectTypeLabel = () => {
        return project.projectType?.toUpperCase() || (project.type === 'project' ? 'PROJECT' : 'FILE');
    };

    const getProjectTypeBadgeColor = () => {
        switch (project.projectType) {
            case 'react': return 'bg-blue-100 text-blue-800';
            case 'vue': return 'bg-green-100 text-green-800';
            case 'angular': return 'bg-red-100 text-red-800';
            case 'typescript': return 'bg-indigo-100 text-indigo-800';
            case 'html': return 'bg-orange-100 text-orange-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div
            onClick={() => onSelect(project)}
            className="p-3 border border-gray-200 rounded-lg hover:border-theme-300 hover:shadow-sm cursor-pointer transition-all"
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5">
                    {getProjectIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 truncate">{project.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded ${getProjectTypeBadgeColor()}`}>
                            {getProjectTypeLabel()}
                        </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate mb-1">{project.path}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{project.type === 'project' ? 'Project' : 'File'}</span>
                        {project.size && (
                            <span>{(project.size / 1024).toFixed(1)} KB</span>
                        )}
                        {project.lastModified && (
                            <span>Modified {new Date(project.lastModified).toLocaleDateString()}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WebViewManager;