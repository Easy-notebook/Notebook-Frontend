import React, { useState, useEffect, useCallback } from 'react';
import usePreviewStore, { FileType } from '../../../store/previewStore';
import CSVPreviewWrapper from './DataTable';
import ImageDisplay from './ImageView/ImageDisplay';
import PDFDisplay from './PDFView/PDFDisplay';
import ReactLiveSandbox from './WebView/ReactLiveSandbox';
import DocDisplay from './DocView/DocDisplay';
import CodeDisplay from './CodeView/CodeDisplay';
import HexDisplay from './HexView/HexDisplay';
import {
  Code,
  Monitor,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import IframeViewer from './WebView/IframeViewer';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';


// ---------- Main ----------
const TabbedPreviewApp: React.FC = () => {
  // UI-only state
  const [showSource, setShowSource] = useState(false);

  const {
    activeFile,
    setTabDirty
  } = usePreviewStore();


  // 键盘快捷键：⌘/Ctrl+S 清理当前 tab 的 dirty（不阻断你已有的保存逻辑）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
      if (!isSave) return;
      e.preventDefault();
      if (activeFile) {
        setTabDirty(activeFile.id, false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFile, setTabDirty]);

  // --- 当切走 HTML 文件时，自动关闭源码视图 ---
  useEffect(() => {
    if (activeFile?.type !== 'html' && showSource) {
      setShowSource(false);
    }
    // 依赖中显式包含 type 与 showSource，避免无效/过度刷新
  }, [activeFile?.type, showSource]);

  // --- 渲染内容 ---
  const renderContent = useCallback(() => {
    if (!activeFile) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-400">
            <div className="text-lg mb-2">No file selected</div>
            <div className="text-sm">Switch to notebook view or select a file from the file explorer</div>
          </div>
        </div>
      );
    }

    // 兜底矫正：文件类型可能被误识别
    const isExcelName =
      activeFile.name.toLowerCase().endsWith('.xlsx') || activeFile.name.toLowerCase().endsWith('.xls');
    const isDocxName = 
      activeFile.name.toLowerCase().endsWith('.docx') || activeFile.name.toLowerCase().endsWith('.doc');
    const isJsName = 
      activeFile.name.toLowerCase().endsWith('.js') || activeFile.name.toLowerCase().endsWith('.ts') || activeFile.name.toLowerCase().endsWith('.mjs');
    const isCssName = 
      activeFile.name.toLowerCase().endsWith('.css') || activeFile.name.toLowerCase().endsWith('.scss') || activeFile.name.toLowerCase().endsWith('.sass');
    const isMdName = 
      activeFile.name.toLowerCase().endsWith('.md') || activeFile.name.toLowerCase().endsWith('.markdown');
    const isPyName = 
      activeFile.name.toLowerCase().endsWith('.py') || activeFile.name.toLowerCase().endsWith('.pyw');
    const isJsonName = activeFile.name.toLowerCase().endsWith('.json');

    let effectiveType: FileType | 'notebook' = activeFile.type as FileType;
    if (isExcelName) {
      effectiveType = 'xlsx';
    } else if (isDocxName) {
      effectiveType = 'docx';
    } else if (isJsName) {
      effectiveType = 'javascript';
    } else if (isCssName) {
      effectiveType = 'css';
    } else if (isMdName) {
      effectiveType = 'markdown';
    } else if (isPyName) {
      effectiveType = 'python';
    } else if (isJsonName) {
      effectiveType = 'json';
    }

    switch (effectiveType) {
      case 'csv':
      case 'xlsx':
        return (
          <div className="flex-1 overflow-hidden">
            <CSVPreviewWrapper typeOverride={effectiveType === 'xlsx' ? 'xlsx' : 'csv'} />
          </div>
        );

      case 'image':
        return (
          <ImageDisplay
            imageData={activeFile.content}
            showDetails
            showControls
            imageInitialHeight="50vh"
            fileName={activeFile.name}
            lastModified={activeFile.lastModified}
          />
        );

      case 'pdf':
        return <PDFDisplay dataUrl={activeFile.content} fileName={activeFile.name} />;

      case 'docx':
      case 'doc':
        return (
          <DocDisplay
            fileName={activeFile.name}
            fileContent={activeFile.content}
            onContentChange={async (newContent: string) => {
              setTabDirty(activeFile.id, true);
              await usePreviewStore.getState().updateActiveFileContent(newContent);
            }}
            showControls
          />
        );

      case 'javascript':
      case 'css':
      case 'python':
      case 'json':
      case 'markdown':
        return (
          <CodeDisplay
            content={activeFile.content}
            language={effectiveType as string}
            fileName={activeFile.name}
            onContentChange={async (newContent: string) => {
              setTabDirty(activeFile.id, true);
              await usePreviewStore.getState().updateActiveFileContent(newContent);
            }}
            showControls
          />
        );

      case 'jsx':
      case 'react':
        return (
          <ReactLiveSandbox
            code={activeFile.content}
            fileName={activeFile.name}
            language="jsx"
            onCodeChange={async (newCode: string) => {
              setTabDirty(activeFile.id, true);
              await usePreviewStore.getState().updateActiveFileContent(newCode);
            }}
          />
        );

      case 'html':
        return (
          <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex-1 flex flex-col min-h-0">
              {showSource ? (
                <div className="flex-1 relative bg-gray-800 rounded-b-lg overflow-hidden">
                  <div className="h-full overflow-auto">
                    <SyntaxHighlighter
                      language="html"
                      style={tomorrow}
                      customStyle={{
                        margin: 0,
                        padding: '16px',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        height: '100%',
                        background: '#2d3748',
                        borderRadius: '0 0 8px 8px'
                      }}
                      showLineNumbers
                      wrapLines
                      wrapLongLines
                    >
                      {activeFile.content}
                    </SyntaxHighlighter>
                  </div>
                  <div className="absolute top-2 right-2 z-10">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(activeFile.content);
                        } catch {
                          // 旧浏览器/非安全上下文兜底
                          const ta = document.createElement('textarea');
                          ta.value = activeFile.content;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                      }}
                      className="px-2 py-1 text-xs bg-gray-700/90 text-white rounded hover:bg-gray-600 transition-colors backdrop-blur-sm"
                      title="Copy HTML source"
                      aria-label="Copy HTML source"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 p-4 bg-white rounded-b-lg overflow-hidden">
                  <div className="h-full w-full bg-white border border-gray-200 rounded overflow-hidden">
                    {/* Centralized iframe rendering */}
                    <IframeViewer
                      notebookId={activeFile?.notebookId}
                      filePath={activeFile?.path}
                      htmlContent={activeFile?.content}
                      title={activeFile?.name}
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'hex':
        return (
          <HexDisplay
            content={activeFile.content}
            fileName={activeFile.name}
            showControls
          />
        );

      default:
        return (
          <HexDisplay
            content={activeFile.content}
            fileName={activeFile.name}
            showControls
          />
        );
    }
  }, [activeFile, setTabDirty, showSource]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Tab controls */}
      {activeFile && (
        <div className="flex items-center">
          {/* HTML 预览/源码切换 */}
          {activeFile?.type === 'html' && (
            <div className="flex items-center bg-gray-200 rounded p-1" role="tablist" aria-label="HTML view switch">
              <button
                type="button"
                onClick={() => setShowSource(false)}
                className={`px-2 py-1 text-sm rounded transition-colors ${
                  !showSource ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Show preview"
                aria-selected={!showSource}
              >
                <Monitor className="w-4 h-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setShowSource(true)}
                className={`px-2 py-1 text-sm rounded transition-colors ${
                  showSource ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Show source code"
                aria-selected={showSource}
              >
                <Code className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
};

export default TabbedPreviewApp;
