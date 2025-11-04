import { useState, useCallback, memo, useMemo } from 'react';
import useStore from '@Store/notebookStore';
import useSettingsStore from '@Store/settingsStore';
import { navigateToLibrary, navigateToHome } from '@/utils/navigation';
import useRouteStore from '@Store/routeStore';
import { BookOpen, Clock, FileText, Tag, Search, Filter, Hash, Image } from 'lucide-react';
import { Input, Empty } from 'antd';
import KnowledgeTrees from './Trees/KnowledgeTrees';
import MiniSidebar from '@LeftSidebar/Mini/MiniSidebar';
import './KnowledgeForest.css';

// 导入共享组件
import {
  StatusDot,
  SidebarContainer,
  SidebarHeader,
  SidebarContent
} from '@LeftSidebar/shared/components';

interface NotebookRecord {
  id: string;
  title: string;
  content: string;
  type: 'markdown' | 'code' | 'hybrid' | 'link' | 'image';
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  cellIndex: number;
}

interface KnowledgeForestSidebarProps {
  tasks: Array<{
    id: string;
    title: string;
    phases: Array<{
      id: string;
      title: string;
      icon: string;
      steps: Array<{ id: string; title: string }>;
    }>;
  }>;
  currentPhaseId: string;
  onPhaseSelect: (phaseId: string, stepId: string) => void;
  onRecordSelect?: (recordId: string) => void;
}

const KnowledgeForestSidebar = ({
  tasks,
  currentPhaseId,
  onPhaseSelect,
  onRecordSelect,
}: KnowledgeForestSidebarProps) => {

  const isCollapsed = useStore((state) => state.isCollapsed);
  const setIsCollapsed = useStore((state) => state.setIsCollapsed);
  const settingstore = useSettingsStore();
  const { currentRoute, currentView } = useRouteStore();
  const cells = useStore((state) => state.cells);

  // Calculate active sidebar item based on current route
  const getActiveItemId = useCallback(() => {
    if (settingstore.settingsOpen) {
      return 'settings';
    }
    
    switch (currentView) {
      case 'empty':
        return 'new-notebook';
      case 'library':
        return 'knowledge-forest';
      case 'workspace':
        return 'workspace';
      default:
        if (currentRoute === '/') {
          return 'new-notebook';
        } else if (currentRoute === '/FoKn/Library') {
          return 'knowledge-forest';
        } else if (currentRoute.startsWith('/workspace/')) {
          return 'workspace';
        }
        return 'knowledge-forest'; // Default for library view
    }
  }, [currentView, currentRoute, settingstore.settingsOpen]);
  const notebookTitle = useStore((state) => state.notebookTitle);
  
  const [activeTab, setActiveTab] = useState<'records' | 'trees' | 'search'>('records');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'markdown' | 'code' | 'hybrid' | 'link' | 'image'>('all');

  // currentPhaseId is used to highlight current phase in mini sidebar

  // 转换cells为记录格式
  const notebookRecords = useMemo((): NotebookRecord[] => {
    return cells.map((cell, index) => ({
      id: cell.id,
      title: cell.type === 'markdown' ? 
        (cell.content.split('\n')[0]?.replace(/^#+\s*/, '') || 'Untitled') : 
        `${cell.type} Cell`,
      content: cell.content,
      type: cell.type as NotebookRecord['type'],
      createdAt: new Date(), // 实际项目中从数据库获取
      updatedAt: new Date(),
      tags: [], // 可以根据内容自动提取标签
      cellIndex: index
    })).filter(record => record.content.trim() !== '');
  }, [cells]);

  // 搜索和过滤记录
  const filteredRecords = useMemo(() => {
    let filtered = notebookRecords;

    // 类型过滤
    if (filterType !== 'all') {
      filtered = filtered.filter(record => record.type === filterType);
    }

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(record => 
        record.title.toLowerCase().includes(query) ||
        record.content.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [notebookRecords, filterType, searchQuery]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [setIsCollapsed, isCollapsed]);

  const handlePhaseClick = useCallback((phaseId: string | null) => {
    if (phaseId === null) {
      toggleCollapse();
      return;
    }
    const phase = tasks?.flatMap(task => task.phases).find(p => p.id === phaseId);
    if (phase && phase.steps.length > 0) {
      onPhaseSelect(phaseId, phase.steps[0].id);
    }
  }, [toggleCollapse, onPhaseSelect, tasks]);

  const handleRecordClick = useCallback((record: NotebookRecord) => {
    // 滚动到对应的cell
    const cellElement = document.querySelector(`[data-cell-id="${record.id}"]`);
    if (cellElement) {
      cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 可以添加高亮效果
      cellElement.classList.add('highlight-cell');
      setTimeout(() => {
        cellElement.classList.remove('highlight-cell');
      }, 2000);
    }
    onRecordSelect?.(record.id);
  }, [onRecordSelect]);

  const allPhases = useMemo(() => tasks?.flatMap(task => task.phases) || [], [tasks]);

  const getTypeIcon = useCallback((type: string) => {
    switch (type) {
      case 'markdown': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'code': return <Hash className="w-4 h-4 text-green-500" />;
      case 'hybrid': return <BookOpen className="w-4 h-4 text-purple-500" />;
      case 'link': return <Tag className="w-4 h-4 text-orange-500" />;
      case 'image': return <Image className="w-4 h-4 text-pink-500" />;
      default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
  }, []);

  const formatDate = useCallback((date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }, []);

  const renderBottomSection = useCallback(() => {
    return (
      <div className="w-full h-12 px-4 flex items-center justify-between border-t border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <StatusDot status="in-progress" />
          <span className="text-sm text-gray-600">
            {filteredRecords.length} records
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {notebookTitle || 'Untitled Notebook'}
        </span>
      </div>
    );
  }, [filteredRecords.length, notebookTitle]);

  if (isCollapsed) {
    return (
      <MiniSidebar
        phases={allPhases}
        currentPhaseId={currentPhaseId}
        onPhaseClick={handlePhaseClick}
        onItemClick={(itemId) => {
          if (itemId === 'library') navigateToLibrary();
          else if (itemId === 'knowledge-forest') setActiveTab('records');
          else if (itemId === 'tools') setActiveTab('search');
          else if (itemId === 'settings') settingstore.openSettings();
          else if (itemId === 'new-notebook') {
            useStore.getState().setNotebookId(null);
            setActiveTab('records');
            navigateToHome();
          }
        }}
        activeItemId={getActiveItemId()}
        onExpandClick={toggleCollapse}
        isMainSidebarExpanded={false}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* 主侧边栏 - 填充剩余空间 */}
      <div className="flex-1">
        <SidebarContainer>
          {/* 头部区域：Tab切换 */}
          <SidebarHeader>
            <div className="flex items-center bg-white align-center w-full justify-center flex-col">
              <div className="flex bg-gray-100 rounded-lg p-1 w-full max-w-xs">
                <button
                  onClick={() => setActiveTab('records')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    activeTab === 'records' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Records
                </button>
                <button
                  onClick={() => setActiveTab('trees')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    activeTab === 'trees' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Trees
                </button>
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    activeTab === 'search' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Search
                </button>
              </div>
            </div>
          </SidebarHeader>

          {/* 中间内容：根据 activeTab 切换显示 */}
          <SidebarContent className="knowledge-forest-scroll">
            {activeTab === 'records' ? (
              <div className="py-2 px-3">
                {/* 过滤器 */}
                <div className="mb-4">
                  <div className="flex items-center gap-1 mb-2">
                    <Filter className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-600">Filter by type</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['all', 'markdown', 'code', 'hybrid', 'link', 'image'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterType(type as any)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          filterType === type
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {type === 'all' ? 'All' : type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 记录列表 */}
                {filteredRecords.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No records found"
                    className="py-8"
                  />
                ) : (
                  <div className="space-y-2">
                    {filteredRecords.map((record) => (
                      <div
                        key={record.id}
                        onClick={() => handleRecordClick(record)}
                        className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getTypeIcon(record.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-sm font-medium text-gray-900 truncate">
                                {record.title}
                              </h4>
                              <span className="text-xs text-gray-500 ml-2">
                                #{record.cellIndex + 1}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                              {record.content.substring(0, 100)}
                              {record.content.length > 100 && '...'}
                            </p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  {formatDate(record.updatedAt)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 capitalize">
                                {record.type}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'trees' ? (
              <KnowledgeTrees />
            ) : (
              <div className="py-3 px-3">
                <div className="mb-4">
                  <Input
                    placeholder="Search records..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    prefix={<Search className="w-4 h-4 text-gray-400" />}
                    allowClear
                    size="small"
                  />
                </div>
                
                {searchQuery && (
                  <div className="space-y-2">
                    {filteredRecords.map((record) => (
                      <div
                        key={record.id}
                        onClick={() => handleRecordClick(record)}
                        className="p-2 bg-white rounded border border-gray-200 hover:border-gray-300 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {getTypeIcon(record.type)}
                          <h4 className="text-sm font-medium text-gray-900 truncate">
                            {record.title}
                          </h4>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-1">
                          {record.content.substring(0, 80)}
                          {record.content.length > 80 && '...'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SidebarContent>

          {/* 底部区域 */}
          {renderBottomSection()}
        </SidebarContainer>
      </div>
    </div>
  );
};

export default memo(KnowledgeForestSidebar);