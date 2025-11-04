import React, { useState } from 'react';
import { Play, FolderOpen, Code, Globe, Settings } from 'lucide-react';
import NotebookTabManager, { TabContentRenderer } from './NotebookTabManager';

/**
 * WebView 演示组件 - 展示如何使用 CodeSandbox 集成的 WebView 系统
 * 
 * 功能特性：
 * 1. 支持 HTML、React、TypeScript 等项目类型
 * 2. 集成 CodeSandbox API 进行在线预览
 * 3. 支持项目文件扫描和依赖分析
 * 4. 自动创建和管理 .sandbox 目录
 */
const WebViewDemo: React.FC = () => {
    const [activeDemo, setActiveDemo] = useState<'basic' | 'advanced' | 'full'>('basic');

    const demos = {
        basic: {
            title: '基础使用',
            description: '最简单的 WebView 使用方式，适合快速预览单个文件或简单项目',
            component: <BasicDemo />
        },
        advanced: {
            title: '高级功能',
            description: '展示项目扫描、类型检测和 CodeSandbox 集成功能',
            component: <AdvancedDemo />
        },
        full: {
            title: '完整集成',
            description: '完整的标签页管理系统，支持多项目同时预览',
            component: <FullDemo />
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">WebView Demo</h1>
                        <p className="text-gray-600 mt-1">CodeSandbox 集成演示</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                            CodeSandbox Ready
                        </span>
                    </div>
                </div>

                {/* Demo Selector */}
                <div className="flex items-center gap-4 mt-4">
                    {Object.entries(demos).map(([key, demo]) => (
                        <button
                            key={key}
                            onClick={() => setActiveDemo(key as any)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                activeDemo === key
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {demo.title}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col">
                {/* Demo Description */}
                <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
                    <p className="text-blue-800">{demos[activeDemo].description}</p>
                </div>

                {/* Demo Component */}
                <div className="flex-1">
                    {demos[activeDemo].component}
                </div>
            </div>
        </div>
    );
};

// 基础演示组件
const BasicDemo: React.FC = () => {
    const [projectPath, setProjectPath] = useState<string>('');
    const [projectType, setProjectType] = useState<'html' | 'react' | 'javascript'>('html');

    const handlePreview = () => {
        console.log('Preview project:', { projectPath, projectType });
    };

    return (
        <div className="p-6">
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">快速预览</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                项目路径
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={projectPath}
                                    onChange={(e) => setProjectPath(e.target.value)}
                                    placeholder="/path/to/your/project"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button className="px-3 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">
                                    <FolderOpen className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                项目类型
                            </label>
                            <select
                                value={projectType}
                                onChange={(e) => setProjectType(e.target.value as any)}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="html">HTML</option>
                                <option value="react">React</option>
                                <option value="javascript">JavaScript</option>
                            </select>
                        </div>

                        <button
                            onClick={handlePreview}
                            disabled={!projectPath}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Play className="w-4 h-4" />
                            开始预览
                        </button>
                    </div>

                    <div className="mt-6 p-4 bg-gray-50 rounded">
                        <h4 className="font-medium text-gray-900 mb-2">支持的功能：</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• 自动创建 .sandbox 目录</li>
                            <li>• 项目文件扫描和分析</li>
                            <li>• CodeSandbox 在线预览</li>
                            <li>• 支持 HTML、React、TypeScript 项目</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 高级演示组件
const AdvancedDemo: React.FC = () => {
    const [scanResult, setScanResult] = useState<any>(null);
    const [isScanning, setIsScanning] = useState(false);

    const handleScan = async () => {
        setIsScanning(true);
        try {
            // 模拟 API 调用
            await new Promise(resolve => setTimeout(resolve, 1500));
            setScanResult({
                projects: [
                    {
                        path: '/Users/demo/react-app',
                        name: 'react-app',
                        type: 'project',
                        projectType: 'react',
                        fileCount: 25,
                        dependencies: 15
                    },
                    {
                        path: '/Users/demo/vue-project',
                        name: 'vue-project', 
                        type: 'project',
                        projectType: 'vue',
                        fileCount: 18,
                        dependencies: 12
                    },
                    {
                        path: '/Users/demo/index.html',
                        name: 'index.html',
                        type: 'file',
                        projectType: 'html',
                        size: '2.5 KB'
                    }
                ]
            });
        } catch (error) {
            console.error('Scan failed:', error);
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="p-6">
            <div className="max-w-4xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 扫描控制 */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">项目扫描</h3>
                        
                        <button
                            onClick={handleScan}
                            disabled={isScanning}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                            {isScanning ? (
                                <Settings className="w-4 h-4 animate-spin" />
                            ) : (
                                <FolderOpen className="w-4 h-4" />
                            )}
                            {isScanning ? '扫描中...' : '扫描项目'}
                        </button>

                        {scanResult && (
                            <div className="mt-4">
                                <h4 className="font-medium text-gray-900 mb-2">
                                    找到 {scanResult.projects.length} 个项目
                                </h4>
                                <div className="space-y-2">
                                    {scanResult.projects.map((project: any, index: number) => (
                                        <div key={index} className="p-3 bg-gray-50 rounded">
                                            <div className="flex items-center gap-2 mb-1">
                                                {project.projectType === 'html' ? (
                                                    <Globe className="w-4 h-4 text-orange-500" />
                                                ) : (
                                                    <Code className="w-4 h-4 text-blue-500" />
                                                )}
                                                <span className="font-medium">{project.name}</span>
                                                <span className="text-xs px-2 py-1 bg-gray-200 rounded">
                                                    {project.projectType}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {project.type === 'project' ? (
                                                    <>文件: {project.fileCount} | 依赖: {project.dependencies}</>
                                                ) : (
                                                    <>大小: {project.size}</>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* API 状态 */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">API 状态</h3>
                        
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">CodeSandbox API</span>
                                <span className="flex items-center gap-1 text-green-600">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    在线
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">项目扫描服务</span>
                                <span className="flex items-center gap-1 text-green-600">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    就绪
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Sandbox 目录</span>
                                <span className="flex items-center gap-1 text-blue-600">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    已配置
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 rounded">
                            <h4 className="font-medium text-blue-900 mb-1">使用提示</h4>
                            <p className="text-sm text-blue-700">
                                点击"扫描项目"查看当前工作空间中的可用项目。系统会自动检测项目类型并创建对应的 .sandbox 目录。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 完整演示组件
const FullDemo: React.FC = () => {
    return (
        <div className="h-full flex flex-col">
            <div className="px-6 py-3 bg-white border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">完整标签页系统</h3>
                <p className="text-sm text-gray-600">支持同时管理多个 Notebook 和 WebView</p>
            </div>
            
            <div className="flex-1">
                <NotebookTabManager />
            </div>
        </div>
    );
};

export default WebViewDemo;