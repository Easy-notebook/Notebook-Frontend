import React, { useMemo } from 'react';
import { deriveSandboxUrlFromFile } from './webviewUtils';

export interface IframeViewerProps {
  notebookId?: string | null;
  filePath?: string; // notebook-relative, e.g., ".sandbox/portfolio/index.html"
  htmlContent?: string; // fallback when not a .sandbox path
  allow?: string;
  sandbox?: string;
  title?: string;
  className?: string;
}

/**
 * Centralized iframe renderer for HTML previews.
 * - If filePath is under .sandbox, builds /sandbox/{id}/{relative} and uses iframe src.
 * - Otherwise falls back to srcDoc with provided htmlContent.
 */
const IframeViewer: React.FC<IframeViewerProps> = ({
  notebookId,
  filePath,
  htmlContent,
  allow = 'accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking',
  sandbox = 'allow-forms allow-modals allow-popups allow-same-origin allow-scripts',
  title = 'Preview',
  className = 'w-full h-full border-0',
}) => {
  const webSrc = useMemo(() => deriveSandboxUrlFromFile(notebookId || undefined, filePath), [notebookId, filePath]);

  if (webSrc) {
    return (
      <iframe
        title={title}
        src={webSrc}
        className={className}
        allow={allow}
        sandbox={sandbox}
      />
    );
  }

  return (
    <iframe
      title={title}
      srcDoc={htmlContent || ''}
      className={className}
      allow={allow}
      sandbox={sandbox}
    />
  );
};

export default IframeViewer;

