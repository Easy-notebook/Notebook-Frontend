// src/router/AppRouter.tsx
import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useParams } from 'react-router-dom';
import NotebookApp from '../components/Notebook/NotebookApp';
import { isHashRoutingEnabled } from '@/utils/routerMode';

/**
 * App Component with Route-aware NotebookApp
 */
const RouteAwareNotebookApp: React.FC = () => {
  useParams();
  return <NotebookApp />;
};

/**
 * Main App Router Component
 */
const AppRouter: React.FC = () => {
  const RouterComponent = isHashRoutingEnabled ? HashRouter : BrowserRouter;

  return (
    <RouterComponent>
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
    </RouterComponent>
  );
};

export default AppRouter;
