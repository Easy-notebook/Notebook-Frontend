import React from 'react';
import { AnsiUp } from 'ansi_up';
import { Output } from '../utils/types';

const ansi_up = new AnsiUp();

/**
 * Image output renderer
 */
export const ImageOutput: React.FC<{ output: Output }> = ({ output }) => (
  <div key={output.key} className="output-image-container flex justify-center items-center">
    <div className="max-w-[80%] flex justify-center">
      <img
        src={typeof output.content === 'string' ? output.content : String(output.content)}
        alt={`Output ${output.key}`}
        className="max-w-full h-auto object-contain"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          console.error('Image load error:', e);
          img.style.display = 'none';
          const errorText = document.createElement('div');
          errorText.className = 'text-center text-red-500';
          errorText.textContent = 'Image load error';
          img.parentNode?.appendChild(errorText);
        }}
      />
    </div>
  </div>
);

/**
 * HTML output renderer
 */
export const HtmlOutput: React.FC<{ output: Output }> = ({ output }) => {
  const htmlContent = String(output.content || '');
  return (
    <div
      key={output.key}
      className="output-html-container"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

/**
 * Text/Error output renderer
 */
export const TextOutput: React.FC<{ output: Output }> = ({ output }) => {
  const htmlContent = ansi_up.ansi_to_html(String(output.content || ''));
  return (
    <pre
      key={output.key}
      className={`font-mono text-sm whitespace-pre-wrap break-words ${
        output.type === 'error' ? 'text-red-500' : ''
      }`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

/**
 * Generic output renderer that delegates to specific renderers
 */
export const OutputRenderer: React.FC<{ output: Output | null }> = ({ output }) => {
  if (!output) return null;

  try {
    if (output.type === 'image') {
      return <ImageOutput output={output} />;
    }
    if (output.type === 'html') {
      return <HtmlOutput output={output} />;
    }
    if (output.type === 'error' || output.type === 'text') {
      return <TextOutput output={output} />;
    }
  } catch (error) {
    console.error('Error rendering output:', error);
    return (
      <pre key={`error-${Date.now()}-${Math.random()}`} className="text-red-500">
        Error rendering output
      </pre>
    );
  }

  return null;
};
