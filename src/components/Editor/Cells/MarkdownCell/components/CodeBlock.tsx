import React from 'react';
import { MermaidPreview } from '@Editor/MermaidPreview';

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!inline && match) {
    const lang = match[1];
    if (lang === 'mermaid') {
      return <MermaidPreview source={String(children).replace(/\n$/, '')} />;
    }
    return (
      <pre {...props} className={className}>
        <code>{children}</code>
      </pre>
    );
  } else {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};
