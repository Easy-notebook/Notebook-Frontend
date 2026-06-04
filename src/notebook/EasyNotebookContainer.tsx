import React, { useEffect } from 'react';
import type { CSSProperties } from 'react';
import AppRouter from '@/router/AppRouter';
import type { NotebookRouterMode } from '@/router/AppRouter';
import NotebookApp from '@/components/Notebook/NotebookApp';
import type { NotebookAppProps } from '@/components/Notebook/NotebookApp';
import useRouteStore from '@/store/routeStore';
import { NotebookRuntimeProvider } from './runtime/NotebookRuntimeProvider';

export type EasyNotebookRouterMode = NotebookRouterMode | 'none';
export type EasyNotebookLayout = 'viewport' | 'container';

export interface EasyNotebookContainerProps {
  className?: string;
  initialRoute?: string;
  layout?: EasyNotebookLayout;
  routerMode?: EasyNotebookRouterMode;
  showBackground?: boolean;
  showToaster?: boolean;
  style?: CSSProperties;
}

const RouteInitializer: React.FC<{ initialRoute?: string }> = ({ initialRoute }) => {
  const setRoute = useRouteStore((state) => state.setRoute);

  useEffect(() => {
    if (initialRoute) {
      setRoute(initialRoute);
    }
  }, [initialRoute, setRoute]);

  return null;
};

const resolveNotebookProps = (
  layout: EasyNotebookLayout,
  className?: string
): NotebookAppProps => ({
  className,
  layout,
});

export const EasyNotebookContainer: React.FC<EasyNotebookContainerProps> = ({
  className,
  initialRoute,
  layout = 'viewport',
  routerMode = 'auto',
  showBackground = true,
  showToaster = true,
  style,
}) => {
  const notebookProps = resolveNotebookProps(layout, className);

  return (
    <div className="easy-notebook-container h-full min-h-0" style={style}>
      <NotebookRuntimeProvider showBackground={showBackground} showToaster={showToaster}>
        <RouteInitializer initialRoute={initialRoute} />
        {routerMode === 'none' ? (
          <NotebookApp {...notebookProps} />
        ) : (
          <AppRouter routerMode={routerMode} notebookProps={notebookProps} />
        )}
      </NotebookRuntimeProvider>
    </div>
  );
};
