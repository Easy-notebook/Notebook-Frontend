import React, { useMemo } from 'react';
import { sanitizeNotebookHtml } from './htmlSanitizer';

type SafeHtmlElement = 'div' | 'pre' | 'span';

interface SafeHtmlContentProps {
  as?: SafeHtmlElement;
  className?: string;
  html: string;
}

export const SafeHtmlContent: React.FC<SafeHtmlContentProps> = ({
  as: Component = 'div',
  className,
  html,
}) => {
  const sanitizedHtml = useMemo(() => sanitizeNotebookHtml(html), [html]);

  return <Component className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
};
