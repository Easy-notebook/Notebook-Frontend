// fileUtils.ts

// Type definitions for file utilities
interface FileItem {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  [key: string]: any;
}

interface ApiResponse {
  status: 'ok' | 'error';
  message?: string;
  files?: FileItem[];
}

interface NotebookApiIntegration {
  listFiles: (notebookId: string) => Promise<ApiResponse>;
  uploadFiles: (
    notebookId: string,
    files: File[],
    config: UploadConfig,
    onProgress: (event: ProgressEvent) => void,
    signal: AbortSignal
  ) => Promise<ApiResponse>;
  getFilePreviewUrl: (notebookId: string, filename: string) => Promise<string>;
  getFileContent: (notebookId: string, filename: string) => Promise<string>;
  downloadFile: (notebookId: string, filename: string) => Promise<void>;
  deleteFile: (notebookId: string, filename: string) => Promise<void>;
}

interface UploadConfig {
  maxFileSize: number;
  mode: 'restricted' | 'open';
  allowedTypes: string[];
  maxFiles?: number;
}

interface ToastOptions {
  title: string;
  description: string;
  variant: 'success' | 'destructive' | 'info' | 'default';
}

type ToastFunction = (options: ToastOptions) => void;

interface FetchFileListParams {
  notebookId: string;
  notebookApiIntegration: NotebookApiIntegration;
  setFileList: (files: FileItem[]) => void;
  toast: ToastFunction;
}

interface HandleFileUploadParams {
  notebookId: string;
  files: File[];
  notebookApiIntegration: NotebookApiIntegration;
  uploadConfig: UploadConfig;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  setIsPreview: (isPreview: boolean) => void;
  toast: ToastFunction;
  onUpdate?: (cellId: string, data: { uploadedFiles: string[] }) => void;
  cellId: string;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  fetchFileList: () => Promise<void>;
}

interface HandlePreviewParams {
  notebookId: string;
  filename: string;
  notebookApiIntegration: NotebookApiIntegration;
  setSelectedFile: (filename: string) => void;
  setPreviewContent: (content: string) => void;
  setPreviewType: (type: 'image' | 'text') => void;
  setIsPreviewOpen: (isOpen: boolean) => void;
  toast: ToastFunction;
  PREVIEWABLE_IMAGE_TYPES: string[];
  PREVIEWABLE_TEXT_TYPES: string[];
}

interface HandleDownloadParams {
  notebookId: string;
  filename: string;
  notebookApiIntegration: NotebookApiIntegration;
  toast: ToastFunction;
}

interface HandleDeleteFileParams {
  notebookId: string;
  filename: string;
  notebookApiIntegration: NotebookApiIntegration;
  fetchFileList: () => Promise<void>;
  toast: ToastFunction;
}

/**
 * 获取文件列表
 * @param params - 参数对象
 */
export const fetchFileList = async ({ notebookId, notebookApiIntegration, setFileList, toast }: FetchFileListParams): Promise<void> => {
    if (!notebookId) return;

    try {
        const data: ApiResponse = await notebookApiIntegration.listFiles(notebookId);
        if (data.status === 'ok') {
            setFileList(data.files);
        } else {
            throw new Error(data.message || 'Failed to fetch file list');
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast({
            title: "Error",
            description: `Failed to fetch file list: ${errorMessage}`,
            variant: "destructive",
        });
        setFileList([]);
    }
};

/**
 * 验证文件是否符合上传配置
 * @param file - 要验证的文件对象
 * @param uploadConfig - 上传配置对象
 * @returns 验证通过返回 true，否则抛出错误
 */
export const validateFile = (file: File, uploadConfig: UploadConfig): boolean => {
    if (file.size > uploadConfig.maxFileSize) {
        throw new Error(
            `File ${file.name} exceeds maximum size of ${uploadConfig.maxFileSize / 1024 / 1024}MB`
        );
    }

    if (uploadConfig.mode === 'restricted') {
        const ext: string = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
        if (!uploadConfig.allowedTypes.includes(ext)) {
            throw new Error(`File type ${ext} is not allowed`);
        }
    }
    return true;
};

/**
 * 处理文件上传
 * @param params - 参数对象
 */
export const handleFileUpload = async ({
    notebookId,
    files,
    notebookApiIntegration,
    uploadConfig,
    setUploading,
    setUploadProgress,
    setError,
    fileInputRef,
    setIsPreview,
    toast,
    onUpdate,
    cellId,
    abortControllerRef,
    fetchFileList,
}: HandleFileUploadParams): Promise<void> => {
    if (!files || files.length === 0) return;

    abortControllerRef.current = new AbortController();

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
        if (
            uploadConfig.mode === 'restricted' &&
            uploadConfig.maxFiles &&
            files.length > uploadConfig.maxFiles
        ) {
            throw new Error(`Maximum ${uploadConfig.maxFiles} files allowed`);
        }

        files.forEach((file: File) => validateFile(file, uploadConfig));

        const result: ApiResponse = await notebookApiIntegration.uploadFiles(
            notebookId,
            files,
            uploadConfig,
            (progressEvent: ProgressEvent) => {
                const percentCompleted: number = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                setUploadProgress(percentCompleted);
            },
            abortControllerRef.current!.signal
        );

        if (result.status === 'ok') {
            await fetchFileList();
            setIsPreview(true);
            toast({
                title: "Upload Successful",
                description: `Successfully uploaded ${files.length} file(s)`,
                variant: "success",
            });

            if (onUpdate) {
                onUpdate(cellId, { uploadedFiles: files.map((file: File) => file.name) });
            }
        } else {
            throw new Error(result.message || 'Upload failed');
        }
    } catch (err: unknown) {
        const error = err as Error;
        if (error.name === 'AbortError') {
            setError('Upload cancelled');
            toast({
                title: "Upload Cancelled",
                description: "File upload was cancelled",
                variant: "info",
            });
        } else {
            const errorMessage = error.message || 'Unknown error';
            setError(errorMessage);
            toast({
                title: "Upload Failed",
                description: errorMessage,
                variant: "destructive",
            });
        }
    } finally {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
};

/**
 * 处理文件预览
 * @param params - 参数对象
 */
export const handlePreview = async ({
    notebookId,
    filename,
    notebookApiIntegration,
    setSelectedFile,
    setPreviewContent,
    setPreviewType,
    setIsPreviewOpen,
    toast,
    PREVIEWABLE_IMAGE_TYPES,
    PREVIEWABLE_TEXT_TYPES,
}: HandlePreviewParams): Promise<void> => {
    if (!notebookId) return;

    try {
        const ext: string = `.${filename.split('.').pop()?.toLowerCase() || ''}`;
        setSelectedFile(filename);

        if (PREVIEWABLE_IMAGE_TYPES.includes(ext)) {
            const imageUrl: string = await notebookApiIntegration.getFilePreviewUrl(notebookId, filename);
            setPreviewContent(imageUrl);
            setPreviewType('image');
        } else if (PREVIEWABLE_TEXT_TYPES.includes(ext)) {
            const content: string = await notebookApiIntegration.getFileContent(notebookId, filename);
            setPreviewContent(content);
            setPreviewType('text');
        }

        setIsPreviewOpen(true);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast({
            title: "Error",
            description: `Failed to preview file: ${errorMessage}`,
            variant: "destructive",
        });
    }
};

/**
 * 处理文件下载
 * @param params - 参数对象
 */
export const handleDownload = async ({ notebookId, filename, notebookApiIntegration, toast }: HandleDownloadParams): Promise<void> => {
    if (!notebookId) return;

    try {
        await notebookApiIntegration.downloadFile(notebookId, filename);
        toast({
            title: "Success",
            description: `${filename} downloaded successfully`,
            variant: "success",
        });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast({
            title: "Error",
            description: `Failed to download file: ${errorMessage}`,
            variant: "destructive",
        });
    }
};

/**
 * 处理文件删除
 * @param params - 参数对象
 */
export const handleDeleteFile = async ({ notebookId, filename, notebookApiIntegration, fetchFileList, toast }: HandleDeleteFileParams): Promise<void> => {
    if (!notebookId) return;

    try {
        await notebookApiIntegration.deleteFile(notebookId, filename);
        await fetchFileList();
        toast({
            title: "Success",
            description: `${filename} deleted successfully`,
            variant: "success",
        });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast({
            title: "Error",
            description: `Failed to delete file: ${errorMessage}`,
            variant: "destructive",
        });
    }
};
