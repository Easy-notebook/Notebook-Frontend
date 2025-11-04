import { useState, useEffect, useRef } from 'react';
import { Terminal, AlertCircle, FileText, Bug } from 'lucide-react';

function BottomBar() {
    const [expanded, setExpanded] = useState(false);
    const [currentTab, setCurrentTab] = useState('terminal');
    const [ip, setIP] = useState('127.0.0.1');
    const [height, setHeight] = useState(220); // Reduced default height
    const version = 'ver 1.0.0';
    const barRef = useRef(null);
    const isDraggingRef = useRef(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(height);

    useEffect(() => {
        async function fetchIP() {
            try {
                const res = await fetch('https://api.ipify.org?format=json');
                const data = await res.json();
                setIP(data.ip);
            } catch (error) {
                console.error('Failed to fetch IP', error);
            }
        }

        fetchIP();
    }, []);

    // Set up drag events for resizing
    useEffect(() => {
        const handleMouseDown = (e) => {
            // Only allow dragging from the resize handle
            if (e.target.classList.contains('resize-handle')) {
                isDraggingRef.current = true;
                startYRef.current = e.clientY;
                startHeightRef.current = height;
                document.body.style.cursor = 'ns-resize';
                e.preventDefault();
            }
        };

        const handleMouseMove = (e) => {
            if (isDraggingRef.current && expanded) {
                const deltaY = startYRef.current - e.clientY;
                const newHeight = Math.max(100, startHeightRef.current + deltaY);
                setHeight(newHeight);
                e.preventDefault();
            }
        };

        const handleMouseUp = () => {
            if (isDraggingRef.current) {
                isDraggingRef.current = false;
                document.body.style.cursor = 'default';
            }
        };

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [expanded, height]);

    return (
        <div
            ref={barRef}
            className={`
                sticky bottom-0 left-0 right-0
                transition-all duration-300
                overflow-hidden z-10
                ${expanded ? 'border-t border-gray-200 shadow-md' : ''}
            `}
            style={{
                height: expanded ? `${height}px` : 'auto',
            }}
        >
            {/* Resize handle */}
            {expanded && (
                <div
                    className="resize-handle absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-theme-800"
                    title="Drag to resize"
                />
            )}

            {/* Header bar - made more compact */}
            <div className="flex items-center justify-between h-8 text-theme-800">
                <style>{`
                    .infoBar{
                        color: white;
                        background-image: linear-gradient(to right, #be123c, #f43f5e);
                        border-radius: 0 5px 0 0;
                        padding: 0.2rem 0.5rem;
                        font-weight: 400;
                    }
                `}</style>
                <div className="flex items-left space-x-3 text-xs font-medium infoBar"
                onClick={() => setExpanded(!expanded)}>
                    <span>{version}</span>
                    <span>IP:[{ip}]</span>
                </div>
            </div>

            {/* Expanded content area */}
            {expanded && (
                <div className="h-[calc(100%-2rem)]">
                    {/* Tab buttons - made more compact */}
                    <div className="flex left-0 space-x-1 px-3 py-0.5 border-b border-gray-200">
                        <button
                            className={`
                                px-2 py-0.5 rounded-md text-xs flex items-center gap-1.5
                                ${currentTab === 'terminal'
                                    ? 'bg-white text-theme-800 shadow-sm border border-theme-100'
                                    : 'text-gray-700 hover:bg-theme-50'}
                            `}
                            onClick={() => setCurrentTab('terminal')}
                        >
                            <Terminal size={12} />
                            <span>Terminal</span>
                        </button>
                        <button
                            className={`
                                px-2 py-0.5 rounded-md text-xs flex items-center gap-1.5
                                ${currentTab === 'problems'
                                    ? 'bg-white text-theme-800 shadow-sm border border-theme-100'
                                    : 'text-gray-700 hover:bg-theme-50'}
                            `}
                            onClick={() => setCurrentTab('problems')}
                        >
                            <AlertCircle size={12} />
                            <span>Problems</span>
                        </button>
                        <button
                            className={`
                                px-2 py-0.5 rounded-md text-xs flex items-center gap-1.5
                                ${currentTab === 'output'
                                    ? 'bg-white text-theme-800 shadow-sm border border-theme-100'
                                    : 'text-gray-700 hover:bg-theme-50'}
                            `}
                            onClick={() => setCurrentTab('output')}
                        >
                            <FileText size={12} />
                            <span>Output</span>
                        </button>
                        <button
                            className={`
                                px-2 py-0.5 rounded-md text-xs flex items-center gap-1.5
                                ${currentTab === 'debug'
                                    ? 'bg-white text-theme-800 shadow-sm border border-theme-100'
                                    : 'text-gray-700 hover:bg-theme-50'}
                            `}
                            onClick={() => setCurrentTab('debug')}
                        >
                            <Bug size={12} />
                            <span>Debug Console</span>
                        </button>
                    </div>

                    {/* Tab content */}
                    <div className="h-[calc(100%-1.75rem)] text-gray-800 overflow-y-auto scrollbar-thin">
                        <style>{`
                          .scrollbar-thin::-webkit-scrollbar {
                            width: 3px;
                          }
                          .scrollbar-thin::-webkit-scrollbar-track {
                            background: transparent;
                          }
                          .scrollbar-thin::-webkit-scrollbar-thumb {
                            background: rgba(225, 29, 72, 0.2);
                            border-radius: 3px;
                          }
                          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
                            background: rgba(225, 29, 72, 0.4);
                          }
                          .scrollbar-thin {
                            scrollbar-width: thin;
                            scrollbar-color: rgba(225, 29, 72, 0.2) transparent;
                          }
                        
                        `}</style>

                        {currentTab === 'terminal' && (
                            <div className="p-2 font-mono">
                                <p className="text-xs">$ npm start</p>
                                <p className="text-xs text-theme-800">&gt; project@0.1.0 start</p>
                                <p className="text-xs text-theme-800">&gt; react-scripts start</p>
                                <p className="text-xs text-gray-500">Starting development server...</p>
                                <p className="text-xs text-gray-500">Compiled successfully!</p>
                                <p className="text-xs mt-1.5">
                                    You can now view the project in the browser.
                                </p>
                                <p className="text-xs mt-0.5">
                                    Local: <span className="text-theme-800">http://localhost:3000</span>
                                </p>
                                <p className="text-xs">
                                    Network: <span className="text-theme-800">http://192.168.1.5:3000</span>
                                </p>
                            </div>
                        )}
                        {currentTab === 'problems' && (
                            <div className="p-2">
                                <p className="text-xs">No problems have been detected in the workspace.</p>
                            </div>
                        )}
                        {currentTab === 'output' && (
                            <div className="p-2">
                                <p className="text-xs font-medium text-gray-800">Build Output</p>
                                <p className="text-xs text-gray-600 mt-0.5">File sizes after gzip:</p>
                                <p className="text-xs mt-0.5">
                                    <span className="text-theme-800 font-medium">62.5 KB</span> <span className="text-gray-600">build/static/js/main.chunk.js</span>
                                </p>
                                <p className="text-xs">
                                    <span className="text-theme-800 font-medium">28.1 KB</span> <span className="text-gray-600">build/static/js/0.chunk.js</span>
                                </p>
                                <p className="text-xs">
                                    <span className="text-theme-800 font-medium">16.2 KB</span> <span className="text-gray-600">build/static/css/main.chunk.css</span>
                                </p>
                            </div>
                        )}
                        {currentTab === 'debug' && (
                            <div className="p-2">
                                <p className="text-xs font-medium">Debug Console</p>
                                <p className="text-xs text-gray-600 mt-0.5">Debug session started</p>
                                <p className="text-xs text-gray-600 mt-0.5">Breakpoints set: 0</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default BottomBar;