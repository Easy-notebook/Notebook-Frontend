import { NotebookAgentTag } from './NotebookAgentTag';
import { useNotebookFileList } from '@Hooks/useNotebookFileList';
import type { FileNode, FileNodeFile } from '@Services/notebook/FileListSession';
import { useNotebookUploadControl } from '@Hooks/useNotebookUploadControl';
import { workspaceFileImport } from '@Services/notebook/WorkspaceFileImport';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import './FileExplorer.css';
import { FileOperationDialog, type FileOperation } from './FileOperationDialog';
import { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { Tree, Dropdown, type MenuProps } from 'antd';
import type { TreeDataNode } from 'antd';
import {
  Folder,
  FolderOpen,
  Download,
  Trash,
  Eye,
  RefreshCw,
  MoreHorizontal,
  ChevronRight,
  ChevronsDownUp,
  NotebookPen,
  FilePlus2,
  FolderPlus,
  Pencil,
  FolderInput,
  History,
  Upload,
} from 'lucide-react';
import { Icon } from '@fluentui/react/lib/Icon';
import { getFileTypeIconProps, initializeFileTypeIcons } from '@fluentui/react-file-type-icons';
import { fileActionClient } from '@Services/notebook/FileActionClient';
import { handleFileUpload, handleDownload } from '@Utils/fileUtils';
import usePreviewStore from '@Store/previewStore';
import useRouteStore from '@Store/routeStore';
import { FILE_PREVIEW_CONFIG } from '@LeftSidebar/shared/constants';

/* ----------------------------- Types ------------------------------ */

/** 扩展 antd TreeDataNode，挂载原始文件数据 */
type FileTreeDataNode = TreeDataNode & { file?: FileNode };

const NB_TEXT_CLASS = 'explorer-name';
const NB_TEXT_CLASS_FILE = 'explorer-name';
const NB_ICON_WRAPPER = 'explorer-icon';
const NB_ICON_SIZE = 16;
const NB_ICON_CLASS = 'explorer-file-icon';

/* -------------------------- Helpers ------------------------------- */

initializeFileTypeIcons();

const PREVIEWABLE_IMAGE_TYPES = FILE_PREVIEW_CONFIG.image;
const PREVIEWABLE_TEXT_TYPES = FILE_PREVIEW_CONFIG.text;
const PREVIEWABLE_PDF_TYPES = FILE_PREVIEW_CONFIG.pdf;
const PREVIEWABLE_DOC_TYPES = FILE_PREVIEW_CONFIG.doc;

const getFileIcon = (filename?: string) => {
  const base = (ext: string) => (
    <Icon {...getFileTypeIconProps({ extension: ext })} className={NB_ICON_CLASS} />
  );
  if (filename?.endsWith('.easynb'))
    return <NotebookPen size={16} className="explorer-notebook-icon" />;
  if (!filename) return base('txt');
  try {
    const ext = (filename.split('.').pop() || 'txt').toLowerCase();
    return base(ext);
  } catch {
    return base('txt');
  }
};

const getContextMenuItems = (
  file: FileNode | null,
  onPreview: (file: FileNodeFile) => void,
  onDownload: (file: FileNodeFile) => void,
  onDelete: (file: FileNodeFile) => void
): MenuProps['items'] => {
  if (!file || file.type !== 'file') return [];
  const ext = file.name ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';
  const isPreviewable = [
    ...PREVIEWABLE_IMAGE_TYPES,
    ...PREVIEWABLE_TEXT_TYPES,
    ...PREVIEWABLE_PDF_TYPES,
    ...PREVIEWABLE_DOC_TYPES,
  ].includes(ext);

  const items: MenuProps['items'] = [];
  if (isPreviewable) {
    items.push({
      key: 'preview',
      icon: <Eye size={16} />,
      label: 'Preview',
      onClick: () => onPreview(file),
    });
  }
  items.push(
    {
      key: 'download',
      icon: <Download size={16} />,
      label: 'Download',
      onClick: () => onDownload(file),
    },
    {
      key: 'delete',
      icon: <Trash size={16} />,
      label: 'Delete',
      danger: true,
      disabled:
        file.removable === false || file.primary === true || file.path === '/notebook.easynb',
      onClick: () => onDelete(file),
    }
  );
  return items;
};

const treeNodeCache = new WeakMap<FileNode, FileTreeDataNode>();
const toTreeData = (nodes: FileNode[]): FileTreeDataNode[] =>
  nodes.map((node) => {
    const cached = treeNodeCache.get(node);
    if (cached) return cached;
    const value: FileTreeDataNode = {
      key: node.path,
      isLeaf: node.type === 'file',
      file: node,
      ...(node.type === 'directory' ? { children: toTreeData(node.children) } : {}),
    };
    treeNodeCache.set(node, value);
    return value;
  });

/* --------------------------- Component ---------------------------- */

interface FileTreeProps {
  notebookId: string;
  projectName?: string;
}

const FileTree = memo(({ notebookId, projectName }: FileTreeProps) => {
  const { state: fileList, refresh: fetchFileListWrapper } = useNotebookFileList(notebookId);
  const processedTree = fileList.files;
  const isLoading = fileList.status === 'loading';
  const treeData = useMemo(() => toTreeData(processedTree), [processedTree]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const workspaceOwner = useRef(notebookId);
  workspaceOwner.current = notebookId;
  const expandedOwner = useRef<string | null>(null);
  useEffect(() => {
    if (expandedOwner.current === notebookId || !processedTree.length) return;
    expandedOwner.current = notebookId;
    setExpandedKeys(
      processedTree.filter((node) => node.type === 'directory').map((node) => node.path)
    );
  }, [notebookId, processedTree]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const importParent = useRef('/');
  const [operation, setOperation] = useState<FileOperation | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [treeHeight, setTreeHeight] = useState(400);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useNotebookUploadControl(notebookId);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  const [uploadState, setUploadState] = useState<{
    uploading: boolean;
    progress: number;
    error: string | null;
  }>({
    uploading: false,
    progress: 0,
    error: null,
  });

  useEffect(() => {
    setUploadState({ uploading: false, progress: 0, error: null });
    setOperation(null);
    setHistoryOpen(false);
    setSelectedKeys([]);
  }, [notebookId]);

  const { error: previewError, isLoading: previewLoading } = usePreviewStore();

  const uploadConfig = useMemo(
    () => ({
      mode: 'restricted' as const,
      maxFileSize: 2 * 1024 * 1024,
      maxFiles: 10,
      allowedTypes: [
        '.txt',
        '.md',
        '.json',
        '.js',
        '.ts',
        '.tsx',
        '.jsx',
        '.py',
        '.html',
        '.css',
        '.svg',
        '.csv',
        '.sql',
        '.yaml',
        '.yml',
        '.aal',
        '.easynb',
      ],
      targetDir: '/',
    }),
    []
  );

  const toast = useCallback(
    ({
      title,
      description,
      variant,
    }: {
      title: string;
      description: string;
      variant: 'success' | 'destructive' | 'info' | 'default';
    }) => {
      console.log(`${variant}: ${title} - ${description}`);
    },
    []
  );

  useEffect(() => {
    if (fileList.status === 'error') {
      toast({
        title: 'Error',
        description: `Failed to fetch file list: ${fileList.error}`,
        variant: 'destructive',
      });
    }
  }, [fileList, toast]);

  useEffect(() => {
    const h = () => fetchFileListWrapper();
    window.addEventListener('refreshFileList', h);
    return () => window.removeEventListener('refreshFileList', h);
  }, [fetchFileListWrapper]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      setTreeHeight(Math.max(1, viewport.clientHeight));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [notebookId]);

  const handlePreviewFile = useCallback(
    async (file: FileNodeFile) => {
      try {
        if (!file) {
          toast({
            title: 'Error',
            description: 'No file selected for preview',
            variant: 'destructive',
          });
          return;
        }
        await usePreviewStore.getState().previewFile(notebookId, file.path, {
          file: { name: file.name, path: file.path },
          lastModified: file.lastModified,
        });
      } catch (e) {
        console.error('Error previewing file:', e);
        toast({
          title: 'Preview Error',
          description: `Failed to preview ${file?.name || 'file'}`,
          variant: 'destructive',
        });
      }
    },
    [toast, notebookId]
  );

  const switchToNotebookMode = useCallback(async () => {
    if (!notebookId) return;
    try {
      useRouteStore.getState().navigateToWorkspace(notebookId);
      await usePreviewStore.getState().switchToNotebook(notebookId);
    } catch (error) {
      toast({
        title: 'Notebook Switch Error',
        description: error instanceof Error ? error.message : 'Failed to switch to notebook',
        variant: 'destructive',
      });
    }
  }, [notebookId, toast]);

  const handleFileSelect = useCallback(
    async (file: FileNodeFile) => {
      if (!file) return;

      const ext = (file.name.split('.').pop() || '').toLowerCase();

      // 特殊处理 .easynb 文件 - 应该切换到 notebook 模式
      if (file.primary === true || file.path === '/notebook.easynb') {
        await switchToNotebookMode();
        return;
      }

      const jsxTypes = ['.jsx', '.tsx'];
      const allPreviewable = [
        ...PREVIEWABLE_IMAGE_TYPES,
        ...PREVIEWABLE_TEXT_TYPES,
        ...PREVIEWABLE_PDF_TYPES,
        ...PREVIEWABLE_DOC_TYPES,
        ...jsxTypes,
      ];
      const isPreviewable = ext === 'easynb' || allPreviewable.includes(`.${ext}`);
      if (isPreviewable) await handlePreviewFile(file);
      else
        toast({
          title: 'File Type Not Supported',
          description: `Cannot preview ${file.name}. .${ext} not supported.`,
          variant: 'info',
        });
    },
    [handlePreviewFile, toast, switchToNotebookMode]
  );

  /** 选择：目录→切展开；文件→预览 */
  const handleTreeSelect = useCallback(
    (
      keys: React.Key[],
      info: { node: FileTreeDataNode; nativeEvent?: MouseEvent | KeyboardEvent }
    ) => {
      // Portal menus belong to an action, not to the underlying row selection.
      if (
        info.nativeEvent?.target instanceof Node &&
        !rootRef.current?.contains(info.nativeEvent.target)
      )
        return;
      const node: FileTreeDataNode = info?.node;
      if (!node?.file) return;

      if (node.file.type === 'directory') {
        const k = node.key;
        setExpandedKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
        setSelectedKeys([k]);
        return;
      }

      handleFileSelect(node.file as FileNodeFile);
      setSelectedKeys(keys);
    },
    [handleFileSelect]
  );

  const handleTreeExpand = useCallback((keys: React.Key[]) => setExpandedKeys(keys), []);

  const handleDownloadFileCb = useCallback(
    (file: FileNodeFile) => {
      handleDownload({
        notebookId,
        filename: file.path,
        fileService: fileActionClient,
        toast,
      });
    },
    [notebookId, toast]
  );

  const handleDeleteFileAction = useCallback(
    (file: FileNodeFile) => {
      if (confirm(`Are you sure you want to delete ${file.name}?`)) {
        void fileActionClient
          .deleteFile(notebookId, file.path, file.revision)
          .then(() => fetchFileListWrapper())
          .catch((error) =>
            toast({ title: 'Delete failed', description: String(error), variant: 'destructive' })
          );
      }
    },
    [notebookId, fetchFileListWrapper, toast]
  );

  const menuFor = (file?: FileNode): MenuProps['items'] => {
    const parent =
      file?.type === 'directory'
        ? file.path
        : file?.path.slice(0, file.path.lastIndexOf('/')) || '/';
    const creatable = !file || file.creatable === true;
    const mutable = !!file && file.removable === true && !(file.type === 'file' && file.primary);
    return [
      {
        key: 'import',
        label: '导入文件…',
        icon: <Upload size={14} />,
        disabled: !creatable,
        onClick: () => {
          importParent.current = parent;
          fileInputRef.current?.click();
        },
      },
      {
        key: 'new-file',
        label: '新建文件…',
        icon: <FilePlus2 size={14} />,
        disabled: !creatable,
        onClick: () => setOperation({ kind: 'file', parent }),
      },
      {
        key: 'new-folder',
        label: '新建文件夹…',
        icon: <FolderPlus size={14} />,
        disabled: !creatable,
        onClick: () => setOperation({ kind: 'folder', parent }),
      },
      ...(file
        ? [
            { type: 'divider' as const },
            {
              key: 'rename',
              label: '重命名…',
              icon: <Pencil size={14} />,
              disabled: !mutable,
              onClick: () => setOperation({ kind: 'rename', file }),
            },
            {
              key: 'move',
              label: '移动到…',
              icon: <FolderInput size={14} />,
              disabled: !mutable,
              onClick: () => setOperation({ kind: 'move', file }),
            },
            ...(file.type === 'file'
              ? (getContextMenuItems(
                  file,
                  handlePreviewFile,
                  handleDownloadFileCb,
                  handleDeleteFileAction
                ) ?? [])
              : []),
          ]
        : []),
      { type: 'divider' },
      {
        key: 'refresh',
        label: '刷新',
        icon: <RefreshCw size={14} />,
        onClick: fetchFileListWrapper,
      },
    ];
  };
  const completeOperation = async (source: string | undefined, destination: string) => {
    if (workspaceOwner.current !== notebookId) return;
    await fetchFileListWrapper();
    if (workspaceOwner.current !== notebookId) return;
    setSelectedKeys([destination]);
    const parent = destination.slice(0, destination.lastIndexOf('/'));
    setExpandedKeys((keys) => [
      ...new Set([
        ...keys.map((key) =>
          source && (key === source || String(key).startsWith(source + '/'))
            ? destination + String(key).slice(source.length)
            : key
        ),
        ...parent
          .split('/')
          .filter(Boolean)
          .map((_, index, array) => '/' + array.slice(0, index + 1).join('/')),
      ]),
    ]);
  };

  // 外层拖拽上传
  useEffect(() => {
    const el = dropZoneRef.current;
    if (!el) return;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      setIsDraggingOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.target === el) setIsDraggingOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as File[];
        handleFileUpload({
          notebookId,
          files,
          fileService: workspaceFileImport,
          uploadConfig: {
            ...uploadConfig,
            targetDir:
              e.target instanceof Element
                ? e.target.closest('[data-directory]')?.getAttribute('data-directory') || '/'
                : '/',
          },
          setUploading: (uploading) => setUploadState((p) => ({ ...p, uploading })),
          setUploadProgress: (progress) => setUploadState((p) => ({ ...p, progress })),
          setError: (error) => setUploadState((p) => ({ ...p, error })),
          fileInputRef,
          setIsPreview: () => {},
          toast,
          onUpdate: () => {},
          cellId: '',
          abortControllerRef,
          fetchFileList: fetchFileListWrapper,
        });
        toast({
          title: 'Upload Started',
          description: `Uploading ${files.length} file(s)`,
          variant: 'info',
        });
      }
    };
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [notebookId, uploadConfig, fetchFileListWrapper, toast, abortControllerRef]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files) as File[];
        handleFileUpload({
          notebookId,
          files,
          fileService: workspaceFileImport,
          uploadConfig: { ...uploadConfig, targetDir: importParent.current },
          setUploading: (uploading) => setUploadState((p) => ({ ...p, uploading })),
          setUploadProgress: (progress) => setUploadState((p) => ({ ...p, progress })),
          setError: (error) => setUploadState((p) => ({ ...p, error })),
          fileInputRef,
          setIsPreview: () => {},
          toast,
          onUpdate: () => {},
          cellId: '',
          abortControllerRef,
          fetchFileList: fetchFileListWrapper,
        });
      }
    },
    [notebookId, uploadConfig, fetchFileListWrapper, toast, abortControllerRef]
  );

  const handleCancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
  }, [abortControllerRef]);

  // 如果没有有效的 notebookId，不应该显示任何文件内容
  if (!notebookId) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm p-4 text-center">
        No notebook selected
      </div>
    );
  }

  return (
    <div ref={rootRef} className="notebook-file-explorer h-full min-h-0 flex flex-col">
      <div className="relative flex-1 flex flex-col overflow-hidden">
        {uploadState.uploading && (
          <div className="absolute inset-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm z-10 flex flex-col justify-center items-center rounded-lg border border-theme-200 dark:border-theme-700">
            <div className="mb-3 text-theme-800 dark:text-gray-200 font-medium">
              Uploading files...
            </div>
            <div className="w-64 h-3 bg-theme-100 rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-theme-500 to-theme-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
            <div className="mt-2 text-theme-700 dark:text-theme-300 font-semibold">
              {uploadState.progress}%
            </div>
            <button
              className="mt-4 px-4 py-2 bg-theme-100 dark:bg-theme-800 text-theme-700 dark:text-theme-200 rounded-lg hover:bg-theme-200 dark:hover:bg-theme-700 transition-colors duration-200 font-medium"
              onClick={handleCancelUpload}
            >
              Cancel
            </button>
          </div>
        )}

        {isDraggingOver && (
          <div className="absolute inset-0 border-2 border-dashed border-theme-400 z-0 rounded-lg animate-pulse" />
        )}

        {previewError && (
          <div className="absolute bottom-4 right-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg shadow-md animate-fade-in">
            <p className="text-sm font-medium">{previewError}</p>
          </div>
        )}

        {/* 主要内容区域 - 不使用 relative，让内容自然流动 */}
        <div className="explorer-body" ref={dropZoneRef}>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept={uploadConfig.allowedTypes.join(',')}
            onChange={handleFileInputChange}
          />

          <div className="explorer-toolbar">
            <NotebookAgentTag notebookId={notebookId} />
            <div className="explorer-toolbar-actions">
              <button
                className="explorer-action"
                title="新建文件"
                aria-label="新建文件"
                onClick={() => setOperation({ kind: 'file', parent: '/' })}
              >
                <FilePlus2 size={15} />
              </button>
              <button
                className="explorer-action"
                title="新建文件夹"
                aria-label="新建文件夹"
                onClick={() => setOperation({ kind: 'folder', parent: '/' })}
              >
                <FolderPlus size={15} />
              </button>
              <button
                className="explorer-action"
                onClick={fetchFileListWrapper}
                title="Refresh file list"
                aria-label="Refresh file list"
              >
                <RefreshCw size={15} />
              </button>
              <button
                className="explorer-action"
                onClick={() => setExpandedKeys([])}
                title="Collapse all folders"
                aria-label="Collapse all folders"
              >
                <ChevronsDownUp size={15} />
              </button>
            </div>
          </div>
          <div className="explorer-workspace" title={projectName || notebookId}>
            <span className="explorer-name">{projectName || 'Workspace'}</span>
          </div>
          <Dropdown
            menu={{ items: menuFor(), onClick: ({ domEvent }) => domEvent.stopPropagation() }}
            trigger={['contextMenu']}
          >
            <div className="explorer-viewport" ref={viewportRef}>
              {isLoading && (
                <div role="status" className="explorer-status">
                  Loading files…
                </div>
              )}
              {previewLoading && (
                <div role="status" className="explorer-status">
                  Opening preview…
                </div>
              )}
              {fileList.status === 'error' && (
                <div role="alert" className="explorer-status explorer-error">
                  {fileList.error}
                </div>
              )}
              <Tree
                height={treeHeight}
                itemHeight={24}
                motion={null}
                switcherIcon={<ChevronRight size={14} />}
                virtual
                showIcon={false}
                treeData={treeData}
                expandedKeys={expandedKeys}
                selectedKeys={selectedKeys}
                onSelect={handleTreeSelect}
                onExpand={handleTreeExpand}
                blockNode
                className="file-explorer-tree"
                style={{ background: 'transparent', fontSize: 12 }}
                titleRender={(node: FileTreeDataNode) => {
                  const file = node.file!;
                  const isDir = file.type === 'directory';
                  const isExpanded = expandedKeys.includes(node.key);
                  return (
                    <Dropdown
                      menu={{
                        items: menuFor(file),
                        onClick: ({ domEvent }) => domEvent.stopPropagation(),
                      }}
                      trigger={['contextMenu']}
                    >
                      <div
                        className="explorer-row group"
                        data-directory={isDir ? file.path : undefined}
                        onContextMenu={(e) => {
                          e.stopPropagation();
                          setSelectedKeys([file.path]);
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'F2' &&
                            file.removable &&
                            !(file.type === 'file' && file.primary)
                          ) {
                            e.preventDefault();
                            setOperation({ kind: 'rename', file });
                          }
                        }}
                      >
                        <div className="explorer-label">
                          <span className={NB_ICON_WRAPPER}>
                            {isDir ? (
                              isExpanded ? (
                                <FolderOpen size={NB_ICON_SIZE} className={NB_ICON_CLASS} />
                              ) : (
                                <Folder size={NB_ICON_SIZE} className={NB_ICON_CLASS} />
                              )
                            ) : (
                              getFileIcon((file as FileNodeFile).name)
                            )}
                          </span>
                          <span
                            className={`${isDir ? NB_TEXT_CLASS : NB_TEXT_CLASS_FILE} flex-1 min-w-0`}
                            title={`${file.path}${file.type === 'file' ? ` · ${file.size ?? 0} bytes · r${file.revision ?? 0}` : ''}`}
                          >
                            {file.name}
                          </span>
                        </div>

                        {
                          <Dropdown
                            menu={{
                              items: menuFor(file),
                              onClick: ({ domEvent }) => domEvent.stopPropagation(),
                            }}
                            trigger={['click']}
                            placement="bottomRight"
                          >
                            <button
                              className="explorer-action explorer-row-action"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="More actions"
                            >
                              <MoreHorizontal
                                size={14}
                                className="text-gray-500 dark:text-gray-400"
                              />
                            </button>
                          </Dropdown>
                        }
                      </div>
                    </Dropdown>
                  );
                }}
              />
            </div>
          </Dropdown>
        </div>
      </div>
      <button
        className="flex items-center gap-2 px-5 py-2 text-xs border-t border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        onClick={() => setHistoryOpen(true)}
      >
        <History size={14} />
        版本历史
      </button>
      {historyOpen && (
        <VersionHistoryDialog
          notebookId={notebookId}
          onClose={() => setHistoryOpen(false)}
          onRestored={(path) => completeOperation(undefined, path)}
        />
      )}
      {operation && (
        <FileOperationDialog
          key={notebookId}
          operation={operation}
          notebookId={notebookId}
          revision={fileList.revision}
          nodes={processedTree}
          onClose={() => setOperation(null)}
          onComplete={completeOperation}
        />
      )}
    </div>
  );
});

export default FileTree;
