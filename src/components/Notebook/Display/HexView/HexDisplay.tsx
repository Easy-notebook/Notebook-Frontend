import React, { useState, useMemo } from 'react';
import { Copy, Download } from 'lucide-react';

interface HexDisplayProps {
  content: string;
  fileName: string;
  showControls?: boolean;
}

const HexDisplay: React.FC<HexDisplayProps> = ({
  content,
  fileName,
  showControls = true
}) => {
  const [bytesPerLine, setBytesPerLine] = useState(16);

  const hexData = useMemo(() => {
    // Convert base64 or string content to bytes
    let bytes: number[];
    
    try {
      if (content.startsWith('data:')) {
        // Extract base64 part from data URL
        const base64 = content.split(',')[1];
        const binaryString = atob(base64);
        bytes = Array.from(binaryString, char => char.charCodeAt(0));
      } else {
        // Try to decode as base64 first, fallback to UTF-8
        try {
          const binaryString = atob(content);
          bytes = Array.from(binaryString, char => char.charCodeAt(0));
        } catch {
          // Fallback to UTF-8 encoding
          bytes = Array.from(content, char => char.charCodeAt(0));
        }
      }
    } catch {
      // Ultimate fallback: treat as string
      bytes = Array.from(content, char => char.charCodeAt(0));
    }

    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += bytesPerLine) {
      const lineBytes = bytes.slice(i, i + bytesPerLine);
      const offset = i.toString(16).padStart(8, '0').toUpperCase();
      const hex = lineBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const ascii = lineBytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
      
      lines.push(`${offset}  ${hex.padEnd(bytesPerLine * 3 - 1, ' ')}  |${ascii}|`);
    }

    return {
      lines,
      totalBytes: bytes.length
    };
  }, [content, bytesPerLine]);

  const handleCopy = async () => {
    const hexText = hexData.lines.join('\n');
    try {
      await navigator.clipboard.writeText(hexText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = hexText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleDownload = () => {
    const hexText = hexData.lines.join('\n');
    const blob = new Blob([hexText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.hex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm">
      {showControls && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-medium text-gray-700">{fileName}</h3>
            <span className="text-xs text-gray-500">
              {hexData.totalBytes.toLocaleString()} bytes
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={bytesPerLine}
              onChange={(e) => setBytesPerLine(Number(e.target.value))}
              className="text-xs px-2 py-1 border border-gray-300 rounded"
            >
              <option value={8}>8 bytes/line</option>
              <option value={16}>16 bytes/line</option>
              <option value={32}>32 bytes/line</option>
            </select>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title="Copy hex dump"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-2 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              title="Download hex dump"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 bg-gray-900 text-green-400 font-mono text-xs leading-relaxed p-4 overflow-auto rounded-b-lg">
        <div className="whitespace-pre">
          {hexData.lines.join('\n')}
        </div>
      </div>
    </div>
  );
};

export default HexDisplay;