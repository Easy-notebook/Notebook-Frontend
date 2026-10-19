import { FileUploadControl } from '@Services/notebook/FileUploadControl';
import { fileUploadClient } from '@Services/notebook/FileUploadClient';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import useStore from '@Store/notebookStore';
import { handleFileUpload } from '@Utils/fileUtils';
import { FileService } from '@Services/notebook/FileService';
import { Backend_BASE_URL } from '@Config/base_url';
import { generateCellId } from '../utils/cellConverters';

const key = new PluginKey('uploadDropPaste');

export const UploadDropExtension = Extension.create({
  name: 'uploadDropPaste',

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const controls = new Set<FileUploadControl>();
    const detachUploads = () => {
      const detached = [...controls];
      controls.clear();
      detached.forEach((control) => control.detach());
    };
    return [
      new Plugin({
        key,
        view() {
          const unsubscribe = useStore.subscribe((state, previous) => {
            if (state.notebookId !== previous.notebookId) detachUploads();
          });
          return {
            destroy() {
              unsubscribe();
              detachUploads();
            },
          };
        },
        props: {
          handleDOMEvents: {
            drop(view, event: Event) {
              const e = event as DragEvent;
              const editor = self.editor as any;
              const state = useStore.getState();
              const { notebookId } = state;
              if (!notebookId) return false;
              if (!e.dataTransfer) return false;

              const files = Array.from(e.dataTransfer.files || []) as File[];
              if (!files.length) return false;

              e.preventDefault();
              e.stopPropagation();

              const uploadConfig: any = {
                mode: 'restricted',
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

              // minimal no-op UI hooks
              const setUploading = () => {};
              const setUploadProgress = () => {};
              const setError = () => {};
              const fileInputRef = { current: null as any };
              const abortControllerRef = new FileUploadControl(notebookId);
              controls.add(abortControllerRef);
              const toast = ({ title, description, variant }: any) => {
                console.log(`${variant || 'info'}: ${title} - ${description}`);
              };

              handleFileUpload({
                notebookId,
                files,
                fileService: fileUploadClient,
                uploadConfig,
                setUploading,
                setUploadProgress,
                setError,
                fileInputRef: fileInputRef as any,
                setIsPreview: () => {},
                toast,
                onUpdate: (_cellId: string, { uploadedFiles }: { uploadedFiles: string[] }) => {
                  const uploaded = uploadedFiles || [];
                  uploaded.forEach((name) => {
                    const lower = name.toLowerCase();
                    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some((ext) =>
                      lower.endsWith(ext)
                    );
                    const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
                    if (isImage) {
                      // Generate a unique cell ID for the image
                      const newCellId = generateCellId();
                      const markdownContent = `![${name}](${url})`;

                      // Create a proper image cell in the store first
                      const { setCells, cells } = useStore.getState();
                      const newImageCell = {
                        id: newCellId,
                        type: 'image' as const,
                        content: markdownContent,
                        outputs: [],
                        enableEdit: true,
                        metadata: {},
                      };
                      setCells([...cells, newImageCell]);

                      try {
                        // Insert the image with proper cellId
                        editor
                          .chain()
                          .focus()
                          .insertContent(
                            `<div data-type="markdown-image" data-cell-id="${newCellId}" data-src="${url}" data-alt="${name}" data-title="${name}" data-markdown="${markdownContent}"></div>`
                          )
                          .run();
                      } catch {
                        editor
                          .chain()
                          .focus()
                          .insertContent(`<img src="${url}" alt="${name}" title="${name}" />`)
                          .run();
                      }
                    } else {
                      const newCellId = generateCellId();
                      const markdown = `[${name}](${url})`;

                      // Create a proper link cell in the store first
                      const { setCells, cells } = useStore.getState();
                      const newLinkCell = {
                        id: newCellId,
                        type: 'link' as const,
                        content: markdown,
                        outputs: [],
                        enableEdit: true,
                      };
                      setCells([...cells, newLinkCell]);

                      editor
                        .chain()
                        .focus()
                        .insertContent(
                          `<div data-type="file-attachment" data-cell-id="${newCellId}" data-markdown="${markdown}"></div>`
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
              })
                .catch((err) => {
                  console.error('Upload failed (drop):', err);
                })
                .finally(() => {
                  controls.delete(abortControllerRef);
                  abortControllerRef.detach();
                });

              return true;
            },
            paste(view, event: Event) {
              const e = event as ClipboardEvent;
              const editor = self.editor as any;
              const state = useStore.getState();
              const { notebookId } = state;
              if (!notebookId || !e.clipboardData) return false;

              const files = Array.from(e.clipboardData.files || []) as File[];
              if (!files.length) return false;

              e.preventDefault();
              e.stopPropagation();

              const uploadConfig: any = {
                mode: 'restricted',
                maxFileSize: 50 * 1024 * 1024,
                maxFiles: files.length,
                allowedTypes: [
                  '.png',
                  '.jpg',
                  '.jpeg',
                  '.gif',
                  '.svg',
                  '.webp',
                  '.txt',
                  '.md',
                  '.json',
                  '.csv',
                  '.pdf',
                ],
                targetDir: 'assets',
              };

              const setUploading = () => {};
              const setUploadProgress = () => {};
              const setError = () => {};
              const fileInputRef = { current: null as any };
              const abortControllerRef = new FileUploadControl(notebookId);
              controls.add(abortControllerRef);
              const toast = ({ title, description, variant }: any) => {
                console.log(`${variant || 'info'}: ${title} - ${description}`);
              };

              handleFileUpload({
                notebookId,
                files,
                fileService: fileUploadClient,
                uploadConfig,
                setUploading,
                setUploadProgress,
                setError,
                fileInputRef: fileInputRef as any,
                setIsPreview: () => {},
                toast,
                onUpdate: (_cellId: string, { uploadedFiles }: { uploadedFiles: string[] }) => {
                  const uploaded = uploadedFiles || [];
                  uploaded.forEach((name) => {
                    const lower = name.toLowerCase();
                    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some((ext) =>
                      lower.endsWith(ext)
                    );
                    const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
                    if (isImage) {
                      // Generate a unique cell ID for the image
                      const newCellId = generateCellId();
                      const markdownContent = `![${name}](${url})`;

                      // Create a proper image cell in the store first
                      const { setCells, cells } = useStore.getState();
                      const newImageCell = {
                        id: newCellId,
                        type: 'image' as const,
                        content: markdownContent,
                        outputs: [],
                        enableEdit: true,
                        metadata: {},
                      };
                      setCells([...cells, newImageCell]);

                      try {
                        // Insert the image with proper cellId
                        editor
                          .chain()
                          .focus()
                          .insertContent(
                            `<div data-type="markdown-image" data-cell-id="${newCellId}" data-src="${url}" data-alt="${name}" data-title="${name}" data-markdown="${markdownContent}"></div>`
                          )
                          .run();
                      } catch {
                        editor
                          .chain()
                          .focus()
                          .insertContent(`<img src="${url}" alt="${name}" title="${name}" />`)
                          .run();
                      }
                    } else {
                      const newCellId = generateCellId();
                      const markdown = `[${name}](${url})`;

                      // Create a proper link cell in the store first
                      const { setCells, cells } = useStore.getState();
                      const newLinkCell = {
                        id: newCellId,
                        type: 'link' as const,
                        content: markdown,
                        outputs: [],
                        enableEdit: true,
                      };
                      setCells([...cells, newLinkCell]);

                      editor
                        .chain()
                        .focus()
                        .insertContent(
                          `<div data-type="file-attachment" data-cell-id="${newCellId}" data-markdown="${markdown}"></div>`
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
              })
                .catch((err) => {
                  console.error('Upload failed (paste):', err);
                })
                .finally(() => {
                  controls.delete(abortControllerRef);
                  abortControllerRef.detach();
                });

              return true;
            },
          },
        },
      }),
    ];
  },
});
