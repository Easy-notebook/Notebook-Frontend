import usePreviewStore, { FileType } from '../../../store/previewStore';
import useStore from '../../../store/notebookStore';
import { useEffect, useCallback, useState } from 'react';
import CSVPreviewWrapper from './DataTable';
import ImageDisplay from './ImageView/ImageDisplay';
import PDFDisplay from './PDFView/PDFDisplay';
import ReactLiveSandbox from './WebView/ReactLiveSandbox';
import DocDisplay from './DocView/DocDisplay';
import CodeDisplay from './CodeView/CodeDisplay';
import HexDisplay from './HexView/HexDisplay';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import IframeViewer from './WebView/IframeViewer';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Monitor, Code } from 'lucide-react';

const PreviewApp: React.FC = () => {
    // Check if we're in split view mode (detached cell)
    const { detachedCellId } = useStore();
    const isInSplitView = !!detachedCellId;
    
    // Get appropriate state based on mode
    const { 
        previewMode, 
        currentPreviewFiles, 
        activeFile, 
        activeSplitFile, 
        setTabDirty 
    } = usePreviewStore();
    
    // Use split file if in split view, otherwise use regular active file
    const currentFile = isInSplitView ? activeSplitFile : activeFile;
    
    // Debug information
    console.log(`PreviewApp: isInSplitView=${isInSplitView}, currentFile=${currentFile?.name || 'null'}, activeSplitFile=${activeSplitFile?.name || 'null'}, activeFile=${activeFile?.name || 'null'}`);
    
    // Local state for HTML source view
    const [showSource, setShowSource] = useState(false);
    // Log debug info - only for main preview mode, not split view
    useEffect(() => {
        if (!isInSplitView && previewMode === 'file' && !activeFile && currentPreviewFiles.length > 0) {
            const firstId = currentPreviewFiles[0].id;
            console.log('PreviewApp: auto-loading first tab', firstId);
            usePreviewStore.getState().loadFileById(firstId);
        }
    }, [isInSplitView, previewMode, activeFile, currentPreviewFiles]);

    // Reset showSource when switching away from HTML files
    useEffect(() => {
        if (currentFile?.type !== 'html' && showSource) {
            setShowSource(false);
        }
    }, [currentFile?.type, showSource]);

    // Render file content (similar to TabbedPreviewApp but without tabs)
    const renderFileContent = useCallback(() => {
        if (!currentFile) {
            return (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-400">
                        <div className="text-lg mb-2">No file selected</div>
                        <div className="text-sm">
                            {isInSplitView ? 
                                "No file loaded in split view" : 
                                "Select a file from the file explorer to preview it here"
                            }
                        </div>
                    </div>
                </div>
            );
        }

        // Handle files that might be misidentified
        const isExcelName = 
            currentFile.name.toLowerCase().endsWith('.xlsx') || 
            currentFile.name.toLowerCase().endsWith('.xls');
        const isDocxName = 
            currentFile.name.toLowerCase().endsWith('.docx') || 
            currentFile.name.toLowerCase().endsWith('.doc');
        const isJsName = 
            currentFile.name.toLowerCase().endsWith('.js') || 
            currentFile.name.toLowerCase().endsWith('.ts') || 
            currentFile.name.toLowerCase().endsWith('.mjs');
        const isCssName = 
            currentFile.name.toLowerCase().endsWith('.css') || 
            currentFile.name.toLowerCase().endsWith('.scss') || 
            currentFile.name.toLowerCase().endsWith('.sass');
        const isMdName = 
            currentFile.name.toLowerCase().endsWith('.md') || 
            currentFile.name.toLowerCase().endsWith('.markdown');
        const isPyName = 
            currentFile.name.toLowerCase().endsWith('.py') || 
            currentFile.name.toLowerCase().endsWith('.pyw');
        const isJsonName = currentFile.name.toLowerCase().endsWith('.json');
        
        let effectiveType: FileType = currentFile.type as FileType;
        if (isExcelName) {
            effectiveType = 'xlsx' as FileType;
        } else if (isDocxName) {
            effectiveType = 'docx' as FileType;
        } else if (isJsName) {
            effectiveType = 'javascript' as FileType;
        } else if (isCssName) {
            effectiveType = 'css' as FileType;
        } else if (isMdName) {
            effectiveType = 'markdown' as FileType;
        } else if (isPyName) {
            effectiveType = 'python' as FileType;
        } else if (isJsonName) {
            effectiveType = 'json' as FileType;
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
                        imageData={currentFile.content}
                        showDetails
                        showControls
                        imageInitialHeight="50vh"
                        fileName={currentFile.name}
                        lastModified={currentFile.lastModified}
                    />
                );

            case 'pdf':
                return <PDFDisplay dataUrl={currentFile.content} fileName={currentFile.name} />;

            case 'docx':
            case 'doc':
                return (
                    <DocDisplay
                        fileName={currentFile.name}
                        fileContent={currentFile.content}
                        onContentChange={async (newContent: string) => {
                            setTabDirty(currentFile.id, true);
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
                        content={currentFile.content}
                        language={effectiveType}
                        fileName={currentFile.name}
                        onContentChange={async (newContent: string) => {
                            setTabDirty(currentFile.id, true);
                            await usePreviewStore.getState().updateActiveFileContent(newContent);
                        }}
                        showControls
                    />
                );

            case 'jsx':
            case 'react':
                return (
                    <ReactLiveSandbox
                        code={currentFile.content}
                        fileName={currentFile.name}
                        language="jsx"
                        onCodeChange={async (newCode: string) => {
                            setTabDirty(currentFile.id, true);
                            await usePreviewStore.getState().updateActiveFileContent(newCode);
                        }}
                    />
                );

            case 'html':
                return (
                    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
                        {/* HTML controls */}
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
                            <h3 className="text-sm font-medium text-gray-700">{currentFile.name}</h3>
                            <div className="flex items-center bg-gray-200 rounded p-1">
                                <button
                                    type="button"
                                    onClick={() => setShowSource(false)}
                                    className={`px-2 py-1 text-sm rounded transition-colors ${
                                        !showSource ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                    title="Show preview"
                                >
                                    <Monitor className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSource(true)}
                                    className={`px-2 py-1 text-sm rounded transition-colors ${
                                        showSource ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                    title="Show source code"
                                >
                                    <Code className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        
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
                                            {currentFile.content}
                                        </SyntaxHighlighter>
                                    </div>
                                    <div className="absolute top-2 right-2 z-10">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await navigator.clipboard.writeText(currentFile.content);
                                                } catch {
                                                    const ta = document.createElement('textarea');
                                                    ta.value = currentFile.content;
                                                    document.body.appendChild(ta);
                                                    ta.select();
                                                    document.execCommand('copy');
                                                    document.body.removeChild(ta);
                                                }
                                            }}
                                            className="px-2 py-1 text-xs bg-gray-700/90 text-white rounded hover:bg-gray-600 transition-colors backdrop-blur-sm"
                                            title="Copy HTML source"
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
                                            notebookId={currentFile?.notebookId}
                                            filePath={currentFile?.path}
                                            htmlContent={currentFile?.content}
                                            title={currentFile?.name}
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
                        content={currentFile.content}
                        fileName={currentFile.name}
                        showControls
                    />
                );

            default:
                return (
                    <HexDisplay
                        content={currentFile.content}
                        fileName={currentFile.name}
                        showControls
                    />
                );
        }
    }, [currentFile, setTabDirty, showSource, isInSplitView]);

    return (
        <div className='w-full h-full flex flex-col'>
            {renderFileContent()}
        </div>
    );
};

export default PreviewApp;