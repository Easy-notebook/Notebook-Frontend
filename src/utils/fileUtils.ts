import { FileUploadAttempt } from '@Services/notebook/FileUploadAttempt';
import type {
  FileUploadClient,
  FileUploadConfig as UploadConfig,
} from '@Services/notebook/FileUploadClient';
import type { ApiResponse } from '@Services/types';

interface FileServiceInterface extends Pick<FileUploadClient, 'uploadFiles'> {
  getFilePreviewUrl: (notebookId: string, filename: string) => Promise<string>;
  getFileContent: (notebookId: string, filename: string) => Promise<string>;
  downloadFile: (notebookId: string, filename: string) => Promise<void>;
  deleteFile: (notebookId: string, filename: string) => Promise<void>;
}

interface ToastOptions {
  title: string;
  description: string;
  variant: 'success' | 'destructive' | 'info' | 'default';
}

type ToastFunction = (options: ToastOptions) => void;

interface HandleFileUploadParams {
  notebookId: string;
  files: File[];
  fileService: Pick<FileUploadClient, 'uploadFiles'>;
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
  fileService: Pick<FileServiceInterface, 'getFilePreviewUrl' | 'getFileContent'>;
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
  fileService: Pick<FileServiceInterface, 'downloadFile'>;
  toast: ToastFunction;
}

interface HandleDeleteFileParams {
  notebookId: string;
  filename: string;
  fileService: Pick<FileServiceInterface, 'deleteFile'>;
  fetchFileList: () => Promise<void>;
  toast: ToastFunction;
}

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
    const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
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
  fileService,
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

  files = [...files];
  uploadConfig = { ...uploadConfig, allowedTypes: [...uploadConfig.allowedTypes] };
  const attempt = new FileUploadAttempt(abortControllerRef);

  try {
    attempt.publish(() => setUploading(true));
    attempt.publish(() => setUploadProgress(0));
    attempt.publish(() => setError(null));
    if (!attempt.isCurrent) return;
    attempt.checkCancellation();
    if (
      uploadConfig.mode === 'restricted' &&
      uploadConfig.maxFiles &&
      files.length > uploadConfig.maxFiles
    ) {
      throw new Error(`Maximum ${uploadConfig.maxFiles} files allowed`);
    }

    files.forEach((file: File) => validateFile(file, uploadConfig));

    const result: ApiResponse = await fileService.uploadFiles(
      notebookId,
      files,
      uploadConfig,
      (progressEvent: ProgressEvent) => {
        attempt.progress(progressEvent.loaded, progressEvent.total, setUploadProgress);
      },
      attempt.signal
    );

    if (!attempt.isCurrent) return;
    attempt.checkCancellation();
    if (result.status === 'ok') {
      if (!attempt.beginRefresh()) return;
      await fetchFileList();
      if (!attempt.succeed()) return;
      attempt.publish(() => setIsPreview(true));
      attempt.publish(() =>
        toast({
          title: 'Upload Successful',
          description: `Successfully uploaded ${files.length} file(s)`,
          variant: 'success',
        })
      );

      if (onUpdate) {
        attempt.publish(() =>
          onUpdate(cellId, { uploadedFiles: files.map((file: File) => file.name) })
        );
      }
    } else {
      throw new Error(result.message || 'Upload failed');
    }
  } catch (err: unknown) {
    const outcome = attempt.fail(err);
    if (!outcome) return;
    const error = err instanceof Error ? err : new Error('Unknown error');
    if (outcome === 'cancelled') {
      attempt.publish(() => setError('Upload cancelled'));
      attempt.publish(() =>
        toast({
          title: 'Upload Cancelled',
          description: 'File upload was cancelled',
          variant: 'info',
        })
      );
    } else {
      const errorMessage = error.message || 'Unknown error';
      attempt.publish(() => setError(errorMessage));
      attempt.publish(() =>
        toast({
          title: 'Upload Failed',
          description: errorMessage,
          variant: 'destructive',
        })
      );
    }
  } finally {
    try {
      attempt.publish(() => setUploading(false));
      attempt.publish(() => setUploadProgress(0));
      attempt.publish(() => {
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
    } finally {
      attempt.release();
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
  fileService,
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
    const ext = `.${filename.split('.').pop()?.toLowerCase() || ''}`;
    setSelectedFile(filename);

    if (PREVIEWABLE_IMAGE_TYPES.includes(ext)) {
      const imageUrl: string = await fileService.getFilePreviewUrl(notebookId, filename);
      setPreviewContent(imageUrl);
      setPreviewType('image');
    } else if (PREVIEWABLE_TEXT_TYPES.includes(ext)) {
      const content: string = await fileService.getFileContent(notebookId, filename);
      setPreviewContent(content);
      setPreviewType('text');
    }

    setIsPreviewOpen(true);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    toast({
      title: 'Error',
      description: `Failed to preview file: ${errorMessage}`,
      variant: 'destructive',
    });
  }
};

/**
 * 处理文件下载
 * @param params - 参数对象
 */
export const handleDownload = async ({
  notebookId,
  filename,
  fileService,
  toast,
}: HandleDownloadParams): Promise<void> => {
  if (!notebookId) return;

  try {
    await fileService.downloadFile(notebookId, filename);
    toast({
      title: 'Success',
      description: `${filename} downloaded successfully`,
      variant: 'success',
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    toast({
      title: 'Error',
      description: `Failed to download file: ${errorMessage}`,
      variant: 'destructive',
    });
  }
};

/**
 * 处理文件删除
 * @param params - 参数对象
 */
export const handleDeleteFile = async ({
  notebookId,
  filename,
  fileService,
  fetchFileList,
  toast,
}: HandleDeleteFileParams): Promise<void> => {
  if (!notebookId) return;

  try {
    await fileService.deleteFile(notebookId, filename);
    await fetchFileList();
    toast({
      title: 'Success',
      description: `${filename} deleted successfully`,
      variant: 'success',
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    toast({
      title: 'Error',
      description: `Failed to delete file: ${errorMessage}`,
      variant: 'destructive',
    });
  }
};
