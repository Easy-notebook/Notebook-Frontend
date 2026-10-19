import { useNotebookUploadControl } from '@Hooks/useNotebookUploadControl';
import { fileUploadClient } from '@Services/notebook/FileUploadClient';
import React, { useRef, useLayoutEffect } from 'react';
import { Editor } from '@tiptap/react';
import useStore from '@Store/notebookStore';
import { handleFileUpload } from '@Utils/fileUtils';
import { FileService } from '@Services/notebook/FileService';
import { Backend_BASE_URL } from '@Config/base_url';

interface SimpleDragManagerProps {
  editor: Editor | null;
  children: React.ReactNode;
}

const SimpleDragManager: React.FC<SimpleDragManagerProps> = ({ editor, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const notebookId = useStore((state) => state.notebookId);
  const abortControllerRef = useNotebookUploadControl(notebookId);

  useLayoutEffect(() => {
    if (!editor || !containerRef.current) return;
    const container = containerRef.current;
    let active = true;
    let revision = 0;
    // Observe identity transitions synchronously, including away-and-back navigation.
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.notebookId !== previous.notebookId) revision++;
    });
    const ownsEditor = () =>
      active && !editor.isDestroyed && useStore.getState().notebookId === notebookId;

    const handleDragOver = (e: DragEvent) => {
      // 允许拖入文件
      if (e.dataTransfer && e.dataTransfer.types?.includes('Files')) {
        e.preventDefault();
      }
    };

    const handleDrop = async (e: DragEvent) => {
      // 文件拖入上传到 assets
      if (!notebookId || !ownsEditor()) return;
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();

      const admittedRevision = revision;
      const ownsDrop = () => ownsEditor() && revision === admittedRevision;
      const files = Array.from(e.dataTransfer.files);

      // Separate Markdown files from others
      const markdownFiles = files.filter((f) => f.name.toLowerCase().endsWith('.md'));
      const otherFiles = files.filter((f) => !f.name.toLowerCase().endsWith('.md'));

      try {
        // Handle Markdown files (Import content)
        if (markdownFiles.length > 0) {
          const { parseMarkdownContent } = await import('@/components/Editor/utils/markdownParser');
          if (!ownsDrop()) return;
          const { convertCellsToHtml } = await import('../../utils/cellConverters');
          if (!ownsDrop()) return;

          for (const file of markdownFiles) {
            if (!ownsDrop()) return;
            const text = await file.text();
            if (!ownsDrop()) return;
            const parsedCells = parseMarkdownContent(text);
            const html = convertCellsToHtml(parsedCells);

            if (editor) {
              editor.chain().focus().insertContent(html).run();
            }
          }
        }

        // Handle other files (Upload as assets)
        if (!ownsDrop() || otherFiles.length === 0) return;

        const filesToUpload = otherFiles;

        const uploadConfig = {
          mode: 'restricted' as const,
          maxFileSize: 50 * 1024 * 1024,
          maxFiles: files.length,
          allowedTypes: [
            '.txt',
            '.md',
            '.json',
            '.js',
            '.py',
            '.html',
            '.css',
            '.csv',
            '.pdf',
            '.zip',
            '.tar',
            '.gz',
            '.doc',
            '.docx',
            '.ppt',
            '.pptx',
            '.xls',
            '.xlsx',
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.svg',
            '.webp',
            '.mp4',
            '.webm',
            '.mov',
            '.avi',
            '.mkv',
          ],
          targetDir: 'assets',
        };

        const toast = ({
          title,
          description,
          variant,
        }: {
          title: string;
          description: string;
          variant?: string;
        }) => {
          console.log(`${variant || 'info'}: ${title} - ${description}`);
        };

        await handleFileUpload({
          notebookId,
          files: filesToUpload,
          fileService: fileUploadClient,
          uploadConfig,
          setUploading: () => {},
          setUploadProgress: () => {},
          setError: () => {},
          fileInputRef,
          setIsPreview: () => {},
          toast,
          onUpdate: (_cellId: string, { uploadedFiles }: { uploadedFiles: string[] }) => {
            if (!ownsDrop()) return;
            (uploadedFiles || []).forEach((name) => {
              if (!ownsDrop()) return;
              const lower = name.toLowerCase();
              const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some((ext) =>
                lower.endsWith(ext)
              );
              const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
              if (isImage) {
                try {
                  // 使用自定义的 markdownImage 节点，保证 TipTap 能稳定解析
                  editor
                    .chain()
                    .focus()
                    .insertContent(
                      `<div data-type="markdown-image" data-src="${url}" data-alt="${name}" data-title="${name}" data-markdown="![${name}](${url})"></div>`
                    )
                    .run();
                } catch {
                  // 兜底为普通的 <img>，ImageExtension 也支持 parseHTML(img[src])
                  editor
                    .chain()
                    .focus()
                    .insertContent(`<img src="${url}" alt="${name}" title="${name}" />`)
                    .run();
                }
              } else {
                // 其他文件使用 file-attachment 节点，渲染为 LinkCell 卡片
                const markdown = `[${name}](${url})`;
                editor
                  .chain()
                  .focus()
                  .insertContent(
                    `<div data-type="file-attachment" data-markdown="${markdown}"></div>`
                  )
                  .run();
              }
            });
          },
          cellId: '',
          abortControllerRef,
          fetchFileList: async () => {
            try {
              await FileService.listFiles(notebookId);
            } catch {
              // Ignore file list errors
            }
          },
        });
      } catch (err) {
        if (ownsDrop()) console.error('TipTap drop upload failed:', err);
      }
    };

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    return () => {
      active = false;
      unsubscribe();
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
    };
  }, [editor, notebookId, abortControllerRef]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {children}
    </div>
  );
};

export default SimpleDragManager;
