import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, DROP_COMMAND, DRAGOVER_COMMAND, PASTE_COMMAND } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useNotebookUploadControl } from '@Hooks/useNotebookUploadControl';
import { fileUploadClient } from '@Services/notebook/FileUploadClient';
import { FileService } from '@Services/notebook/FileService';
import { handleFileUpload } from '@Utils/fileUtils';
import { Backend_BASE_URL } from '@Config/base_url';
import { parseMarkdownContent } from '../../utils/markdownParser';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';

const allowedTypes = [
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
];
/** Drop and paste share one upload owner and the existing notebook upload lifecycle. */
export function AssetInputPlugin() {
  const [editor] = useLexicalComposerContext();
  const session = useNotebookEditorSession();
  const control = useNotebookUploadControl(session.notebookId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    let active = true;
    const owns = () => active && session.owns() && editor.isEditable();
    const upload = async (files: File[]) => {
      const notebookId = session.notebookId;
      if (!notebookId || !owns()) return;
      try {
        for (const file of files.filter((file) => file.name.toLowerCase().endsWith('.md'))) {
          const source = await file.text();
          if (!owns()) return;
          for (const cell of parseMarkdownContent(source))
            session.insert({ ...cell, id: crypto.randomUUID() });
        }
        const assets = files.filter((file) => !file.name.toLowerCase().endsWith('.md'));
        if (!assets.length || !owns()) return;
        await handleFileUpload({
          notebookId,
          files: assets,
          fileService: fileUploadClient,
          uploadConfig: {
            mode: 'restricted',
            maxFileSize: 50 * 1024 * 1024,
            maxFiles: assets.length,
            allowedTypes,
            targetDir: 'assets',
          },
          setUploading: () => {},
          setUploadProgress: () => {},
          setError: () => {},
          fileInputRef: fileInput,
          setIsPreview: () => {},
          toast: ({ title, description }) => console.info(`${title}: ${description}`),
          cellId: '',
          abortControllerRef: control,
          onUpdate: (_id, { uploadedFiles }) => {
            if (!owns()) return;
            for (const name of uploadedFiles) {
              const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
              const image = /\.(png|jpe?g|gif|svg|webp)$/i.test(name);
              session.insert({
                id: crypto.randomUUID(),
                type: image ? 'image' : 'link',
                content: `${image ? '!' : ''}[${name.replace(/[[\]\\]/g, '\\$&')}](${url})`,
                outputs: [],
              });
            }
          },
          fetchFileList: async () => {
            await FileService.listFiles(notebookId);
          },
        });
      } catch (error) {
        if (owns()) console.error('Notebook upload failed', error);
      }
    };
    const detach = mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          if (!owns() || !event.dataTransfer?.types.includes('Files')) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (!files.length || !owns()) return false;
          event.preventDefault();
          event.stopPropagation();
          void upload(files);
          return true;
        },
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent)) return false;
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || !owns()) return false;
          event.preventDefault();
          void upload(files);
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
    return () => {
      active = false;
      detach();
    };
  }, [editor, session, control]);
  return null;
}
