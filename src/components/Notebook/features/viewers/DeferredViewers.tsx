import { Component, Suspense, lazy, type ReactNode } from 'react';

// Shared lazy identities across normal and tabbed preview panes.
export const CSVPreviewWrapper = lazy(() => import('./data-table/DataTable'));
export const DocDisplay = lazy(() => import('./doc/DocDisplay'));
export const ReactLiveSandbox = lazy(() => import('./web/ReactLiveSandbox'));
export const CodeDisplay = lazy(() => import('./code/CodeDisplay'));
export const HighlightedSource = lazy(() => import('./code/HighlightedSource'));

export class PreviewLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert" className="p-4">
          Preview could not be loaded. Reload the page to try again. Your notebook content is
          unchanged.
        </div>
      );
    return (
      <Suspense
        fallback={
          <div role="status" className="p-4">
            Loading preview…
          </div>
        }
      >
        {this.props.children}
      </Suspense>
    );
  }
}
