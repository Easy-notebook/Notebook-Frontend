import React, { useState, useEffect, useCallback, useRef } from 'react';
import mammoth from 'mammoth';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
  Edit3,
  Eye,
  Save,
  Download,
  FileText,
  AlertCircle,
  Loader
} from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

interface DocDisplayProps {
  fileName: string;
  fileContent: ArrayBuffer | string;
  onContentChange?: (content: string) => void;
  initialEditMode?: boolean;
  showControls?: boolean;
}

const DocDisplay: React.FC<DocDisplayProps> = ({
  fileName,
  fileContent,
  onContentChange,
  initialEditMode = false,
  showControls = true
}) => {
  // States
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [editableContent, setEditableContent] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(initialEditMode);
  const [isDirty, setIsDirty] = useState(false);
  const quillRef = useRef<ReactQuill>(null);

  // Quill configuration
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
  };

  const quillFormats = [
    'header', 'bold', 'italic', 'underline', 'strike',
    'color', 'background', 'list', 'bullet', 'indent',
    'align', 'link', 'image'
  ];

  // Load and parse document
  const loadDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!fileContent) {
        throw new Error('No file content provided');
      }

      console.log('DocDisplay - fileContent type:', typeof fileContent);
      console.log('DocDisplay - fileContent length:', typeof fileContent === 'string' ? fileContent.length : fileContent.byteLength);
      console.log('DocDisplay - fileContent preview:', typeof fileContent === 'string' ? fileContent.substring(0, 100) + '...' : '[ArrayBuffer]');

      let html: string;
      
      if (typeof fileContent === 'string') {
        // Check if content is already HTML (backend has already processed the DOCX)
        if (fileContent.trim().startsWith('<') && fileContent.includes('</')) {
          console.log('DocDisplay - Content is already HTML, using directly');
          html = fileContent;
        }
        // Check if it's a URL that we need to fetch
        else if (fileContent.startsWith('http://') || fileContent.startsWith('https://') || fileContent.startsWith('/assets/')) {
          console.log('DocDisplay - Content is a URL, fetching file...');
          try {
            const response = await fetch(fileContent);
            if (!response.ok) {
              throw new Error(`Failed to fetch file: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            console.log('DocDisplay - File fetched successfully, buffer size:', buffer.byteLength);
            
            // Use mammoth to convert DOCX to HTML
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            
            if (result.messages && result.messages.length > 0) {
              console.warn('Mammoth conversion messages:', result.messages);
            }
            
            html = result.value;
          } catch (error) {
            console.error('DocDisplay - Error fetching file from URL:', error);
            throw new Error(`Failed to fetch document: ${error.message}`);
          }
        } else {
          // Handle data URLs or base64 strings
          let base64Data = fileContent;
          
          // Check if it's a data URL
          if (fileContent.includes('base64,')) {
            base64Data = fileContent.split('base64,')[1];
            console.log('DocDisplay - Extracted base64 data length:', base64Data.length);
          } else {
            console.log('DocDisplay - Assuming raw base64 data');
          }
          
          // Validate base64 format before attempting to decode
          const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!base64Regex.test(base64Data)) {
            console.error('DocDisplay - Invalid base64 format detected');
            console.error('DocDisplay - First 50 chars:', base64Data.substring(0, 50));
            throw new Error('Invalid base64 format: contains invalid characters or is not base64 encoded');
          }
          
          try {
            console.log('DocDisplay - Attempting to decode base64...');
            const binaryString = atob(base64Data);
            console.log('DocDisplay - Decoded binary string length:', binaryString.length);
            
            const buffer = new ArrayBuffer(binaryString.length);
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('DocDisplay - ArrayBuffer created successfully');
            
            // Use mammoth to convert DOCX to HTML
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            
            if (result.messages && result.messages.length > 0) {
              console.warn('Mammoth conversion messages:', result.messages);
            }
            
            html = result.value;
          } catch (error) {
            console.error('DocDisplay - Error decoding base64 data:', error);
            throw new Error(`Base64 decoding failed: ${error.message}. The content may not be properly base64 encoded.`);
          }
        }
      } else if (fileContent instanceof ArrayBuffer) {
        console.log('DocDisplay - Using provided ArrayBuffer');
        // Use mammoth to convert DOCX to HTML
        const result = await mammoth.convertToHtml({ arrayBuffer: fileContent });
        
        if (result.messages && result.messages.length > 0) {
          console.warn('Mammoth conversion messages:', result.messages);
        }
        
        html = result.value;
      } else {
        console.error('DocDisplay - Unexpected fileContent type:', typeof fileContent);
        throw new Error('Unsupported file content type');
      }

      console.log('DocDisplay - Final HTML length:', html.length);
      setHtmlContent(html);
      setEditableContent(html);
      
    } catch (err) {
      console.error('Error loading document:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load document';
      setError(`Document loading failed: ${errorMessage}. Please ensure the file is a valid DOC/DOCX document.`);
    } finally {
      setIsLoading(false);
    }
  }, [fileContent]);

  // Initialize document loading
  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Handle content change in edit mode
  const handleContentChange = useCallback((content: string) => {
    setEditableContent(content);
    setIsDirty(true);
    onContentChange?.(content);
  }, [onContentChange]);

  // Save content
  const handleSave = useCallback(async () => {
    try {
      setHtmlContent(editableContent);
      setIsDirty(false);
      
      // Trigger external save handler if provided
      onContentChange?.(editableContent);
      
    } catch (err) {
      console.error('Error saving document:', err);
      setError('Failed to save document');
    }
  }, [editableContent, onContentChange]);

  // Export as DOCX
  const handleExport = useCallback(async () => {
    try {
      // Convert HTML back to plain text for DOCX export
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = editableContent;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      
      // Create a new DOCX document
      const doc = new Document({
        sections: [{
          properties: {},
          children: plainText.split('\n').map(line => 
            new Paragraph({
              children: [new TextRun(line)],
            })
          ),
        }],
      });

      // Generate and download the DOCX file
      const buffer = await Packer.toBuffer(doc);
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      
      const exportFileName = fileName.replace(/\.[^/.]+$/, '_edited.docx');
      saveAs(blob, exportFileName);
      
    } catch (err) {
      console.error('Error exporting document:', err);
      setError('Failed to export document');
    }
  }, [editableContent, fileName]);

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    if (isEditMode && isDirty) {
      // Auto-save when leaving edit mode
      handleSave();
    }
    setIsEditMode(!isEditMode);
  }, [isEditMode, isDirty, handleSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditMode) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, handleSave]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader className="w-8 h-8 animate-spin text-theme-500" />
          <span className="text-gray-600">Loading document...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4 text-red-600">
          <AlertCircle className="w-8 h-8" />
          <span className="text-center">{error}</span>
          <button
            onClick={loadDocument}
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Controls */}
      {showControls && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-900 truncate">
              {fileName}
              {isDirty && <span className="text-orange-500 ml-1">*</span>}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Edit/Preview toggle */}
            <button
              onClick={toggleEditMode}
              className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
                isEditMode 
                  ? 'bg-theme-100 text-theme-700 hover:bg-theme-200' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title={isEditMode ? 'Switch to preview' : 'Switch to edit'}
            >
              {isEditMode ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {isEditMode ? 'Preview' : 'Edit'}
            </button>

            {/* Save button */}
            {isEditMode && isDirty && (
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                title="Save changes (Ctrl+S)"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            )}

            {/* Export button */}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              title="Export as DOCX"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isEditMode ? (
          <div className="h-full">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={editableContent}
              onChange={handleContentChange}
              modules={quillModules}
              formats={quillFormats}
              style={{ height: '100%' }}
              className="h-full [&_.ql-container]:h-[calc(100%-42px)] [&_.ql-editor]:min-h-full"
            />
          </div>
        ) : (
          <div className="p-6 max-w-4xl mx-auto">
            <div 
              className="prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DocDisplay;