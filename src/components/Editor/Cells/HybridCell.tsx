import React, { useMemo, useCallback, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Trash2, Loader2} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useStore from '../../../store/notebookStore';

const LoadingIndicator = () => (
    <div className="flex items-center space-x-2 text-xs text-gray-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Generating...</span>
    </div>
);

const HybridCell = ({ cell, onDelete }) => {
    const { updateCell, getCurrentCellId } = useStore();
    const [setIsProcessing] = useState(false);
    const isCurrentCell = cell.id === getCurrentCellId();

    // Content type detection
    const contentType = useMemo(() => {
        const lines = cell.content.split('\n');
        const codeBlockRegex = /^```(\w+)?$/;

        for (let i = 0; i < lines.length; i++) {
            if (codeBlockRegex.test(lines[i].trim())) {
                const language = lines[i].trim().slice(3);
                let content = '';
                let j = i + 1;

                while (j < lines.length && !codeBlockRegex.test(lines[j].trim())) {
                    content += lines[j] + '\n';
                    j++;
                }

                return {
                    type: 'code',
                    language: language || 'javascript',
                    content: content.trim()
                };
            }
        }

        return {
            type: 'markdown',
            content: cell.content
        };
    }, [cell.content]);

    // Handle content changes
    const handleContentChange = useCallback((value) => {
        // setIsProcessing(true);
        updateCell(cell.id, value);
        // Simulate processing time
        // setTimeout(() => setIsProcessing(false), 500);
    }, [cell.id, updateCell]);

    return (
        <div className="relative p-4 rounded-lg border shadow-md group">
            {/* Loading animation background */}

            <div className="absolute inset-0 rounded-lg">
                <div className="absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 animate-pulse"></div>
                <div className="absolute inset-0 bg-white/50"></div>
            </div>


            {/* Content container */}
            <div className="relative">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center space-x-2">
                        <LoadingIndicator />
                    </div>
                    <div className="flex items-center space-x-2">
                        {/* {contentType.type === 'code' && cell.type !== 'code' && (
                            <button
                                onClick={handleConvertToCode}
                                className="p-2 bg-theme-500 text-white rounded-md hover:bg-theme-700 transition-colors"
                                title="Convert to Code Cell"
                            >
                                <Code2 className="w-4 h-4" />
                            </button>
                        )} */}
                        {onDelete && (
                            <button
                                onClick={() => onDelete(cell.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-red-500 text-white rounded-md hover:bg-red-700"
                                title="Delete Cell"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content renderer */}
                <div className="mt-4">
                    {contentType.type === 'code' ? (
                        <div className="border rounded-md overflow-hidden">
                            <div className="bg-gray-100 px-4 py-2 text-sm text-gray-700 border-b flex justify-between items-center">
                                <span>{contentType.language}</span>
                                {isCurrentCell && <span className="text-xs text-theme-600">Current Cell</span>}
                            </div>
                            <CodeMirror
                                value={contentType.content}
                                height="auto"
                                extensions={[markdown()]}
                                onChange={handleContentChange}
                                className="text-base"
                                theme="light"
                            />
                        </div>
                    ) : (
                        <div
                            className="prose max-w-none text-base leading-relaxed"
                            onClick={() => setIsProcessing(false)}
                        >
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                            >
                                {/* 预处理内容：将单个换行符转换为 markdown 换行格式（两个空格 + 换行符） */}
                                {(contentType.content || 'AI is Thinking...').replace(/(?<!\n)\n(?!\n)/g, '  \n')}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(HybridCell);