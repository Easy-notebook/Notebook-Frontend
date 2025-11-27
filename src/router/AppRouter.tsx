// src/router/AppRouter.tsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useParams } from 'react-router-dom';
import { isHashRoutingEnabled } from '@/utils/routerMode';
import { Spin } from 'antd';

// Lazy load NotebookApp
const NotebookApp = lazy(() => import('../components/Notebook/NotebookApp'));

/**
 * Loading Fallback Component
 */
const LoadingFallback = () => (
  <div className="h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <Spin size="large" tip="Loading Notebook...">
      <div className="p-12" />
    </Spin>
  </div>
);

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
      <Suspense fallback={<LoadingFallback />}>
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
      </Suspense>
    </RouterComponent>
  );
};

export default AppRouter;
