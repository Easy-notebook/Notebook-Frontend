// src/router/AppRouter.tsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useParams } from 'react-router-dom';
import { isHashRoutingEnabled } from '@/utils/routerMode';
import type { NotebookAppProps } from '@/components/Notebook/NotebookApp';

// Lazy load NotebookApp
const NotebookApp = lazy(() => import('../components/Notebook/NotebookApp'));

export type NotebookRouterMode = 'auto' | 'browser' | 'hash';

export interface AppRouterProps {
  notebookProps?: NotebookAppProps;
  routerMode?: NotebookRouterMode;
}

/**
 * Loading Fallback Component
 */
import { LoadingPage } from '../components/Notebook/pages/LoadingPage';

/**
 * App Component with Route-aware NotebookApp
 */
const RouteAwareNotebookApp: React.FC<{ notebookProps?: NotebookAppProps }> = ({
  notebookProps,
}) => {
  useParams();
  return <NotebookApp {...notebookProps} />;
};

/**
 * Main App Router Component
 */
const AppRouter: React.FC<AppRouterProps> = ({ notebookProps, routerMode = 'auto' }) => {
  const RouterComponent =
    routerMode === 'hash' || (routerMode === 'auto' && isHashRoutingEnabled)
      ? HashRouter
      : BrowserRouter;

  return (
    <RouterComponent>
      <Suspense fallback={<LoadingPage />}>
        <Routes>
          {/* 主页 - 显示 NotebookApp (EmptyState) */}
          <Route path="/" element={<RouteAwareNotebookApp notebookProps={notebookProps} />} />

          {/* 库页面 - 显示 NotebookApp (LibraryState) */}
          <Route
            path="/FoKn/Library"
            element={<RouteAwareNotebookApp notebookProps={notebookProps} />}
          />

          {/* 工作区页面 - 显示 NotebookApp (MainContent) */}
          <Route
            path="/workspace/:notebookId"
            element={<RouteAwareNotebookApp notebookProps={notebookProps} />}
          />

          {/* 其他路由重定向到主页 */}
          <Route path="*" element={<RouteAwareNotebookApp notebookProps={notebookProps} />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  );
};

export default AppRouter;
