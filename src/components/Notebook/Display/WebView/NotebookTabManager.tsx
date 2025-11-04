import React, { useState, useEffect, useCallback } from 'react';
import useStore from '../../../../store/notebookStore';
import { X, Plus, BookOpen, Save, MoreHorizontal, Code, Globe } from 'lucide-react';
import WebViewManager from './WebViewManager';

// Notebook tab interface
interface NotebookTab {
    id: string;
    name: string;
    isActive: boolean;
    isDirty?: boolean;
    lastModified?: string;
    type?: 'notebook' | 'webview';
    projectPath?: string;
    projectType?: 'html' | 'react' | 'javascript' | 'typescript' | 'vue' | 'angular';
}

// Tab component for notebooks
interface NotebookTabProps {
    tab: NotebookTab;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onRename: (id: string, newName: string) => void;
    isClosable?: boolean;
}

const NotebookTab: React.FC<NotebookTabProps> = ({ 
    tab, 
    onSelect, 
    onClose, 
    onRename, 
    isClosable = true 
}) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [tempName, setTempName] = useState(tab.name);
    const [showMenu, setShowMenu] = useState(false);

    const handleRename = useCallback(() => {
        if (tempName.trim() && tempName !== tab.name) {
            onRename(tab.id, tempName.trim());
        } else {
            setTempName(tab.name);
        }
        setIsRenaming(false);
    }, [tempName, tab.name, tab.id, onRename]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setTempName(tab.name);
            setIsRenaming(false);
        }
    }, [handleRename, tab.name]);

    return (
        <div
            className={`
                relative flex items-center gap-2 px-4 py-2 border-r border-gray-200 cursor-pointer
                transition-colors duration-200 min-w-0 max-w-64 group
                ${tab.isActive 
                    ? 'bg-white border-b-2 border-b-theme-500 text-gray-900' 
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }
            `}
            onClick={() => !isRenaming && onSelect(tab.id)}
        >
            {tab.type === 'webview' ? (
                tab.projectType === 'html' ? <Globe className="w-4 h-4 flex-shrink-0" /> : <Code className="w-4 h-4 flex-shrink-0" />
            ) : (
                <BookOpen className="w-4 h-4 flex-shrink-0" />
            )}
            
            {isRenaming ? (
                <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={handleKeyDown}
                    className="flex-1 min-w-0 px-1 py-0 text-sm bg-white border border-theme-300 rounded focus:outline-none focus:ring-1 focus:ring-theme-500"
                    autoFocus
                />
            ) : (
                <span 
                    className="flex-1 truncate text-sm font-medium"
                    onDoubleClick={() => setIsRenaming(true)}
                    title={tab.name}
                >
                    {tab.name}
                    {tab.isDirty && <span className="text-orange-500 ml-1">*</span>}
                </span>
            )}

            {/* Tab actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Save indicator for dirty tabs */}
                {tab.isDirty && (
                    <button
                        className="p-1 hover:bg-gray-200 rounded text-orange-500"
                        title="Unsaved changes - click to save"
                    >
                        <Save className="w-3 h-3" />
                    </button>
                )}

                {/* Menu button */}
                <button
                    className="p-1 hover:bg-gray-200 rounded"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(!showMenu);
                    }}
                    title="More actions"
                >
                    <MoreHorizontal className="w-3 h-3" />
                </button>

                {/* Close button */}
                {isClosable && (
                    <button
                        className="p-1 hover:bg-red-200 rounded text-gray-400 hover:text-red-600"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose(tab.id);
                        }}
                        title="Close notebook"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* Context menu */}
            {showMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 min-w-36">
                    <button
                        className="w-full text-left px-3 py-1 hover:bg-gray-100 text-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsRenaming(true);
                            setShowMenu(false);
                        }}
                    >
                        Rename
                    </button>
                    <button
                        className="w-full text-left px-3 py-1 hover:bg-gray-100 text-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implement duplicate
                            setShowMenu(false);
                        }}
                    >
                        Duplicate
                    </button>
                    <hr className="my-1 border-gray-200" />
                    <button
                        className="w-full text-left px-3 py-1 hover:bg-red-100 text-red-600 text-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose(tab.id);
                            setShowMenu(false);
                        }}
                    >
                        Close
                    </button>
                </div>
            )}
        </div>
    );
};

// Main notebook tab manager
const NotebookTabManager: React.FC = () => {
    // Store state
    const notebookId = useStore(s => s.notebookId);
    const notebookTitle = useStore(s => s.notebookTitle);

    // Local state for tabs
    const [tabs, setTabs] = useState<NotebookTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    // Initialize tabs from current notebook
    useEffect(() => {
        if (notebookId) {
            const notebookTab: NotebookTab = {
                id: notebookId,
                name: notebookTitle || 'Untitled Notebook',
                isActive: true,
                isDirty: false, // TODO: Get from store
                lastModified: new Date().toISOString()
            };

            setTabs([notebookTab]);
            setActiveTabId(notebookId);
        } else {
            setTabs([]);
            setActiveTabId(null);
        }
    }, [notebookId, notebookTitle]);

    // Handle tab selection
    const handleTabSelect = useCallback((tabId: string) => {
        setActiveTabId(tabId);
        setTabs(prev => prev.map(tab => ({
            ...tab,
            isActive: tab.id === tabId
        })));
        
        // TODO: Switch to the selected notebook if different from current
    }, []);

    // Handle tab close
    const handleTabClose = useCallback((tabId: string) => {
        setTabs(prev => {
            const updatedTabs = prev.filter(tab => tab.id !== tabId);
            
            // If closing active tab, select the last remaining tab
            if (tabId === activeTabId && updatedTabs.length > 0) {
                const newActiveTab = updatedTabs[updatedTabs.length - 1];
                setActiveTabId(newActiveTab.id);
                newActiveTab.isActive = true;
            } else if (updatedTabs.length === 0) {
                setActiveTabId(null);
            }
            
            return updatedTabs;
        });
        
        // TODO: Close notebook in the backend/store if needed
    }, [activeTabId]);

    // Handle tab rename
    const handleTabRename = useCallback((tabId: string, newName: string) => {
        setTabs(prev => prev.map(tab => 
            tab.id === tabId 
                ? { ...tab, name: newName, isDirty: true }
                : tab
        ));
        
        // TODO: Update notebook title in store/backend
    }, []);

    // Handle new notebook creation
    const handleNewNotebook = useCallback(() => {
        // TODO: Create new notebook
        const newId = `notebook_${Date.now()}`;
        const newTab: NotebookTab = {
            id: newId,
            name: 'New Notebook',
            isActive: false,
            isDirty: true,
            type: 'notebook'
        };
        
        setTabs(prev => [...prev, newTab]);
    }, []);

    // Handle new WebView creation
    const handleNewWebView = useCallback(() => {
        const newId = `webview_${Date.now()}`;
        const newTab: NotebookTab = {
            id: newId,
            name: 'Web Preview',
            isActive: false,
            isDirty: false,
            type: 'webview'
        };
        
        setTabs(prev => [...prev, newTab]);
        handleTabSelect(newId);
    }, [handleTabSelect]);

    if (tabs.length === 0) {
        return (
            <div className="flex items-center justify-center h-12 bg-gray-100 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleNewNotebook}
                        className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                    >
                        <BookOpen className="w-4 h-4" />
                        New Notebook
                    </button>
                    <button
                        onClick={handleNewWebView}
                        className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                    >
                        <Globe className="w-4 h-4" />
                        Web Preview
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center bg-gray-100 border-b border-gray-200 min-h-[48px]">
            {/* Notebook tabs */}
            <div className="flex flex-1 overflow-x-auto">
                {tabs.map((tab) => (
                    <NotebookTab
                        key={tab.id}
                        tab={tab}
                        onSelect={handleTabSelect}
                        onClose={handleTabClose}
                        onRename={handleTabRename}
                        isClosable={tabs.length > 1}
                    />
                ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 px-3 py-2 border-l border-gray-300">
                <button
                    onClick={handleNewNotebook}
                    className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900 transition-colors"
                    title="New notebook"
                >
                    <BookOpen className="w-4 h-4" />
                </button>
                <button
                    onClick={handleNewWebView}
                    className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-900 transition-colors"
                    title="New web preview"
                >
                    <Globe className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

// 标签页内容渲染器
interface TabContentRendererProps {
    activeTab: NotebookTab | null;
}

const TabContentRenderer: React.FC<TabContentRendererProps> = ({ activeTab }) => {
    if (!activeTab) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Tab</h3>
                    <p className="text-gray-600">Select a tab or create a new one to get started.</p>
                </div>
            </div>
        );
    }

    if (activeTab.type === 'webview') {
        return (
            <WebViewManager 
                initialPath={activeTab.projectPath}
                initialType={activeTab.projectPath ? 'project' : undefined}
            />
        );
    }

    // 默认 notebook 内容
    return (
        <div className="flex items-center justify-center h-full bg-white">
            <div className="text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-blue-500" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{activeTab.name}</h3>
                <p className="text-gray-600">Notebook content will appear here.</p>
            </div>
        </div>
    );
};

// 导出组件集合
export default NotebookTabManager;
export { TabContentRenderer };