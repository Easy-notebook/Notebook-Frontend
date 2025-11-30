import React, { useEffect, useRef, useState } from 'react';
import { BaseNodeView, BaseNodeViewProps } from '../../core/BaseNodeView';
import { LaTeXModel, LaTeXContext } from './LaTeXModel';
import { Edit3, X, Copy, Maximize2, Minimize2 } from 'lucide-react';
import 'katex/dist/katex.min.css';
import katex from 'katex';

// Inject styles
const latexStyles = `
  .latex-markdown-wrapper {
    line-height: 1;
  }
  .latex-markdown-wrapper.inline-latex {
    display: inline !important;
    vertical-align: baseline;
  }
  .latex-markdown-wrapper.block-latex {
    display: inline-block !important;
    width: 100% !important;
    text-align: center !important;
    margin: 0.5em 0 !important;
  }
  .latex-markdown-wrapper .katex-rendered {
    color: currentColor !important;
  }
  .latex-markdown-wrapper .katex-display {
    margin: 0.5em auto;
    text-align: center;
  }
  .latex-markdown-wrapper .katex {
    color: currentColor !important;
    font-size: 1em !important;
  }
  .latex-markdown-wrapper .katex * {
    color: currentColor !important;
  }
  .latex-markdown-wrapper.inline-latex .katex {
    display: inline !important;
    vertical-align: baseline !important;
  }
  .latex-markdown-wrapper.inline-latex .katex-rendered {
    display: inline !important;
    vertical-align: baseline !important;
    line-height: 1 !important;
  }
  .latex-markdown-wrapper.block-latex .katex-rendered {
    display: block !important;
    text-align: center !important;
    margin: 0.5em auto !important;
    width: 100% !important;
  }
  .latex-markdown-wrapper.block-latex::before,
  .latex-markdown-wrapper.block-latex::after {
    content: "";
    display: block;
    width: 100%;
    height: 0;
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = latexStyles;
  document.head.appendChild(styleSheet);
}

const LaTeXViewComponent = (props: any) => {
  const { node, updateAttributes, deleteNode, fsm } = props;
  const { latex, displayMode } = node.attrs;
  const currentState = fsm.getCurrentState();
  const isEditing = currentState === 'editing';

  const [tempLatex, setTempLatex] = useState(latex || '');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTempLatex(latex || '');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // textareaRef.current.setSelectionRange(latex?.length || 0, latex?.length || 0);
        }
      }, 0);
    }
  }, [isEditing, latex]);

  useEffect(() => {
    const codeToRender = isEditing ? tempLatex : latex;
    if (!codeToRender) {
      setRenderedHtml('');
      setError('');
      return;
    }

    try {
      const html = katex.renderToString(codeToRender, {
        displayMode: displayMode,
        throwOnError: false,
        errorColor: '#dc2626',
        strict: 'warn',
        trust: false,
      });
      setRenderedHtml(html);
      setError('');
    } catch (err: any) {
      setError(err.message || 'LaTeX rendering error');
      setRenderedHtml('');
    }
  }, [tempLatex, latex, displayMode, isEditing]);

  const [showToolbar, setShowToolbar] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowToolbar(false);
      }
    };

    if (showToolbar) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolbar]);

  const handleSave = () => {
    updateAttributes({ latex: tempLatex });
    fsm.send('SAVE');
  };

  const handleCancel = () => {
    setTempLatex(latex || '');
    fsm.send('CANCEL');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const copyLatex = () => {
    const latexText = displayMode ? `$$${latex}$$` : `$${latex}$`;
    navigator.clipboard.writeText(latexText);
    setShowToolbar(false);
  };

  return (
    <span
      ref={containerRef}
      className={`latex-markdown-wrapper ${displayMode ? 'block-latex' : 'inline-latex'}`}
      style={{
        display: displayMode ? 'inline-block' : 'inline',
        verticalAlign: 'baseline',
        width: displayMode ? '100%' : 'auto',
        textAlign: displayMode ? 'center' : 'left',
        color: 'inherit',
      }}
    >
      {isEditing ? (
        <span className={`latex-editor ${displayMode ? 'block' : 'inline-block'}`}>
          <input
            ref={textareaRef}
            type="text"
            value={tempLatex}
            onChange={(e) => setTempLatex(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="Enter LaTeX formula, e.g. E = mc^2"
            className="p-1 border border-gray-300 dark:border-gray-600 rounded font-mono text-xs focus:outline-none focus:border-theme-400 bg-white dark:bg-gray-800 text-gray-900 dark:!text-white"
            style={{
              width: `${Math.max(120, tempLatex.length * 8 + 20)}px`,
              minWidth: '120px',
              maxWidth: displayMode ? '100%' : '300px',
              height: '24px',
            }}
          />
          {displayMode && tempLatex && (
            <span className="mt-2 block">
              {error ? (
                <span className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs block">
                  ⚠️ LaTeX Error: {error}
                </span>
              ) : (
                <span
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  className="katex-rendered katex-display text-center block"
                  style={{ color: 'inherit' }}
                />
              )}
            </span>
          )}
          {displayMode && (
            <span className="mt-1 flex items-center justify-between">
              <button
                onClick={() => updateAttributes({ displayMode: !displayMode })}
                className="text-xs text-theme-500 hover:text-theme-700"
              >
                Switch to Inline
              </button>
            </span>
          )}
        </span>
      ) : (
        <span className={`latex-display ${displayMode ? 'block w-full text-center' : 'inline'}`}>
          {latex ? (
            <span className={`relative group ${displayMode ? 'inline-block' : 'inline'}`}>
              {renderedHtml ? (
                <span
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowToolbar(!showToolbar);
                  }}
                  className={`katex-rendered cursor-pointer transition-all rounded
                                        ${
                                          displayMode
                                            ? 'katex-display px-4 py-2 hover:bg-white/60 hover:backdrop-blur-md dark:hover:bg-gray-800/60 dark:hover:backdrop-blur-md hover:shadow-sm hover:scale-[1.02]'
                                            : 'px-1 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                                        }
                                        ${showToolbar ? 'ring-2 ring-theme-300 ring-opacity-50' : ''}
                                    `}
                  style={{
                    color: 'inherit',
                    display: displayMode ? 'block' : 'inline',
                    verticalAlign: 'baseline',
                    margin: 0, // Margin handled by parent centering
                  }}
                  title="Click to show options"
                />
              ) : error ? (
                <span className="p-1 bg-red-100 text-red-600 text-xs rounded">⚠️ {error}</span>
              ) : (
                <span className="p-1 bg-gray-100 text-gray-600 text-xs rounded">Rendering...</span>
              )}
              <span
                className={`absolute -top-8 left-1/2 transform -translate-x-1/2 flex gap-1 transition-all duration-200 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur shadow-sm rounded p-1 border border-gray-200 dark:border-gray-700
                                    ${showToolbar ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}
                                `}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateAttributes({ displayMode: !displayMode });
                    setShowToolbar(false);
                  }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 transition-colors"
                  title={displayMode ? 'Switch to Inline' : 'Switch to Block'}
                >
                  {displayMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fsm.send('EDIT');
                  }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 transition-colors"
                  title="Edit"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyLatex();
                  }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 transition-colors"
                  title="Copy"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNode();
                  }}
                  className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 transition-colors"
                  title="Delete"
                >
                  <X size={12} />
                </button>
              </span>
            </span>
          ) : (
            <span
              className="latex-placeholder inline-block border border-dashed border-gray-300 rounded px-2 py-1 text-gray-500 cursor-pointer hover:border-gray-400 transition-colors text-xs"
              onClick={() => fsm.send('EDIT')}
            >
              Add Formula
            </span>
          )}
        </span>
      )}
    </span>
  );
};

export const LaTeXView = (props: any) => {
  return (
    <BaseNodeView<LaTeXContext>
      {...props}
      wrapperComponent="span"
      createFSM={LaTeXModel.createFSM}
      createContext={(p) => ({
        node: p.node,
        updateAttributes: p.updateAttributes,
        deleteNode: p.deleteNode,
      })}
      renderState={(state, context, fsm) => <LaTeXViewComponent {...props} fsm={fsm} />}
    />
  );
};
