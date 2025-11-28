// src/router/AppRouter.tsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useParams } from 'react-router-dom';
import { isHashRoutingEnabled } from '@/utils/routerMode';

// Lazy load NotebookApp
const NotebookApp = lazy(() => import('../components/Notebook/NotebookApp'));

/**
 * Loading Fallback Component
 */
import { LoadingPage } from '../components/Notebook/pages/LoadingPage';

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
      <Suspense fallback={<LoadingPage />}>
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
