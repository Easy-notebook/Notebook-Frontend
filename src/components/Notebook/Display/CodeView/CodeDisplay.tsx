import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Eye, Code, Sun, Moon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface CodeDisplayProps {
  content: string;
  language: string;
  fileName: string;
  onContentChange?: (newContent: string) => void;
  showControls?: boolean;
}

const getLanguageFromFileType = (fileType: string): string => {
  switch (fileType) {
    case 'javascript': return 'javascript';
    case 'css': return 'css';
    case 'python': return 'python';
    case 'json': return 'json';
    case 'jsx': return 'jsx';
    case 'html': return 'html';
    case 'markdown': return 'markdown';
    default: return 'text';
  }
};

const CodeDisplay: React.FC<CodeDisplayProps> = ({
  content,
  language,
  fileName,
  onContentChange,
  showControls = true
}) => {
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const syntaxLanguage = getLanguageFromFileType(language);
  const theme = isDarkTheme ? tomorrow : prism;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
      {showControls && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700">{fileName}</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-200 rounded p-1">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className={`px-2 py-1 text-sm rounded transition-colors ${
                  !showPreview ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Show code"
              >
                <Code className="w-4 h-4" />
              </button>
              {language === 'markdown' && (
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className={`px-2 py-1 text-sm rounded transition-colors ${
                    showPreview ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Show preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsDarkTheme(!isDarkTheme)}
              className="px-2 py-1 text-sm bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
              title={`Switch to ${isDarkTheme ? 'light' : 'dark'} theme`}
            >
              {isDarkTheme ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 flex flex-col min-h-0">
        {showPreview && language === 'markdown' ? (
          <div className="flex-1 p-4 bg-white rounded-b-lg overflow-auto">
            <div className="prose max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {/* 预处理内容：将单个换行符转换为 markdown 换行格式（两个空格 + 换行符） */}
                {content.replace(/(?<!\n)\n(?!\n)/g, '  \n')}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden">
            <div className="h-full overflow-auto">
              <SyntaxHighlighter
                language={syntaxLanguage}
                style={theme}
                customStyle={{
                  margin: 0,
                  padding: '16px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  height: '100%',
                  background: isDarkTheme ? '#2d3748' : '#f7fafc',
                  borderRadius: '0 0 8px 8px'
                }}
                showLineNumbers
                wrapLines
                wrapLongLines
              >
                {content}
              </SyntaxHighlighter>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeDisplay;