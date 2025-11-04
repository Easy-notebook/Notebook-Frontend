// src/router/AppRouter.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import NotebookApp from '../components/Notebook/NotebookApp';

/**
 * App Component with Route-aware NotebookApp
 */
const RouteAwareNotebookApp: React.FC = () => {
  const params = useParams();
  const location = window.location;
  
  // 初始化路由状态
  React.useEffect(() => {
    // 由于所有路由都指向同一个 NotebookApp 实例
    // 路由状态的同步将由 useRouteSync hook 在 NotebookApp 中处理
  }, [params, location]);

  return (
    <div className="min-h-screen bg-gray-50" style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      <NotebookApp />
    </div>
  );
};

/**
 * Main App Router Component
 */
const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* 主页 - 显示 NotebookApp (EmptyState) */}
        <Route path="/" element={<RouteAwareNotebookApp />} />
        
        {/* 库页面 - 显示 NotebookApp (LibraryState) */}
        <Route path="/FoKn/Library" element={<RouteAwareNotebookApp />} />
        
        {/* 工作区页面 - 显示 NotebookApp (MainContent) */}
        <Route path="/workspace/:notebookId" element={<RouteAwareNotebookApp />} />
        
        {/* 其他路由重定向到主页 */}
        <Route path="*" element={<RouteAwareNotebookApp />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRouter;