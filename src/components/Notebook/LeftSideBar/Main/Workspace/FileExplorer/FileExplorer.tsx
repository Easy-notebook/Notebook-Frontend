// /src/Frontend/src/components/Notebook/LeftSideBar/Main/Workspace/FileExplorer/FileExplorer.tsx
import { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { Tree, Dropdown, type MenuProps } from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import {
  Folder,
  FolderOpen,
  Download,
  Trash,
  Eye,
  RefreshCw,
  MoreHorizontal,
} from 'lucide-react';
import { Icon } from '@fluentui/react/lib/Icon';
import { getFileTypeIconProps, initializeFileTypeIcons } from '@fluentui/react-file-type-icons';
import { notebookApiIntegration } from '@Services/notebookServices';
import {
  fetchFileList,
  handleFileUpload,
  handleDownload,
  handleDeleteFile,
} from '@Utils/fileUtils';
import usePreviewStore from '@Store/previewStore';
import useStore from '@Store/notebookStore';
import { FILE_PREVIEW_CONFIG } from '@LeftSidebar/shared/constants';
import { LoadingIndicator } from '@LeftSidebar/shared/components';

/* ----------------------------- Types ------------------------------ */

declare global {
  interface Window {
    Backend_BASE_URL?: string;
  }
}

type FileNodeDirectory = {
  name: string;
  type: 'directory';
  path: string;
  children: FileNode[];
};

type FileNodeFile = {
  name: string;
  type: 'file';
  path: string;
  size?: number;
  lastModified?: number | string;
};

type FileNode = FileNodeDirectory | FileNodeFile;

/** 扩展 antd TreeDataNode，挂载原始文件数据 */
type FileTreeDataNode = TreeDataNode & { file?: FileNode };

type WidthTier = 'narrow' | 'regular' | 'wide';
const pickTier = (w: number): WidthTier => (w < 220 ? 'narrow' : w < 300 ? 'regular' : 'wide');

/* ------------------------ UI Tokens（与 PhaseSection 对齐） ------------------------ */
// 与 PhaseSection 完全一致的文本，支持换行
const NB_TEXT_CLASS = 'text-[12px] leading-[20px] font-normal text-theme-800 break-words';
const NB_TEXT_CLASS_FILE = 'text-[12px] leading-[20px] font-normal text-gray-700 break-words';

// 行高 - 支持多行文本，使用 auto 高度
const NB_ROW_H = 'min-h-[28px] py-1';

// 统一图标：容器 28×28（h-7 w-7），图标本体 18
const NB_ICON_WRAPPER = 'inline-flex items-center justify-center h-7 w-7 flex-shrink-0';
const NB_ICON_SIZE = 18;
const NB_ICON_CLASS = 'text-theme-600';

// 过渡/容器
const NB_TRANSITION = 'transition-all duration-300';

/* -------------------------- Helpers ------------------------------- */

const getMimeTypeForFileName = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png','jpg','jpeg','gif','webp'].includes(ext))
    return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'pdf') return 'application/pdf';
  if (['html','htm'].includes(ext)) return 'text/html';
  if (ext === 'csv') return 'text/csv';
  if (['txt','md','json','js','ts','tsx','jsx','py','css'].includes(ext)) return 'text/plain';
  return 'application/octet-stream';
};

const createPlaceholderFile = (name: string, lastModified?: number | string): File => {
  const mime = getMimeTypeForFileName(name);
  const lm = typeof lastModified === 'number' ? lastModified : Date.now();
  return new File([''], name, { type: mime, lastModified: lm });
};

initializeFileTypeIcons();

const PREVIEWABLE_IMAGE_TYPES = FILE_PREVIEW_CONFIG.image;
const PREVIEWABLE_TEXT_TYPES  = FILE_PREVIEW_CONFIG.text;
const PREVIEWABLE_PDF_TYPES   = FILE_PREVIEW_CONFIG.pdf;
const PREVIEWABLE_DOC_TYPES   = FILE_PREVIEW_CONFIG.doc;

const getFileIcon = (filename?: string) => {
  const base = (ext: string) => (
    <Icon {...getFileTypeIconProps({ extension: ext })} className={NB_ICON_CLASS} />
  );
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
    items.push({ key:'preview', icon:<Eye size={16} />, label:'Preview', onClick:() => onPreview(file) });
  }
  items.push(
    { key:'download', icon:<Download size={16} />, label:'Download', onClick:() => onDownload(file) },
    { key:'delete',   icon:<Trash size={16} />,    label:'Delete',   danger:true, onClick:() => onDelete(file) },
  );
  return items;
};

const toTreeData = (nodes: FileNode[]): FileTreeDataNode[] =>
  nodes.map((node) => {
    const isDirectory = node.type === 'directory';
    const out: FileTreeDataNode = {
      key: node.path,
      isLeaf: !isDirectory,
      file: node,
    };
    if (isDirectory && node.children) out.children = toTreeData(node.children);
    return out;
  });

/* --------------------------- Component ---------------------------- */

interface FileTreeProps {
  notebookId: string;
  projectName?: string;
}

const FileTree = memo(({ notebookId, projectName }: FileTreeProps) => {
  const tasks = useStore((s) => s.tasks);

  const [files, setFiles] = useState<FileNode[] | null>(null);
  const [treeData, setTreeData] = useState<FileTreeDataNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [widthTier, setWidthTier] = useState<WidthTier>('regular');

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  const [uploadState, setUploadState] = useState<{ uploading:boolean; progress:number; error:string | null }>({
    uploading:false, progress:0, error:null,
  });

  const { error: previewError, isLoading: previewLoading } = usePreviewStore();

  const uploadConfig = useMemo(() => ({
    mode: 'restricted' as const,
    maxFileSize: 50 * 1024 * 1024,
    maxFiles: 10,
    allowedTypes: [
      '.txt','.md','.json','.js','.ts','.tsx','.jsx','.py','.html','.css',
      '.png','.jpg','.jpeg','.gif','.svg','.csv','.pdf','.doc','.docx','.xlsx','.xls',
    ],
    targetDir: '.assets',
  }), []);

  const toast = useCallback(
    ({ title, description, variant }: {title:string; description:string; variant:'success'|'destructive'|'info'|'default'}) => {
      console.log(`${variant}: ${title} - ${description}`);
    },
    []
  );

  const utilsApi = useMemo(() => ({
    listFiles: async (nid: string) => {
      const resp: any = await notebookApiIntegration.listFiles(nid);
      const mapNode = (f: any): any => ({
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified ?? 0, path: f.path || f.name,
        ...(f.type === 'directory' ? { children: Array.isArray(f.children) ? f.children.map(mapNode) : [] } : {}),
      });
      return {
        status: resp.status, message: resp.message,
        files: Array.isArray(resp.files) ? resp.files.map(mapNode) : [],
      } as { status:'ok'|'error'; message?:string; files?: any[] };
    },
    uploadFiles: async (nid: string, files: File[], config: { mode:'restricted'|'open'; allowedTypes:string[]; maxFiles?:number }) => {
      return await notebookApiIntegration.uploadFiles(
        nid, files, { mode:config.mode, allowedTypes:config.allowedTypes, maxFiles:config.maxFiles, targetDir: uploadConfig.targetDir } as any
      );
    },
    getFilePreviewUrl: async (nid: string, filename: string) => {
      try {
        const base = window.Backend_BASE_URL ? window.Backend_BASE_URL.replace(/\/$/, '') : '';
        const name = filename.split('/').pop() || filename;
        return `${base}/assets/${encodeURIComponent(nid)}/${encodeURIComponent(name)}`;
      } catch {
        return '';
      }
    },
    getFileContent: async (nid: string, filename: string) => {
      const resp: any = await notebookApiIntegration.getFile(nid, filename);
      return resp.content || '';
    },
    downloadFile: async (_nid: string, filename: string) => {
      const blob = await notebookApiIntegration.downloadFile(_nid, filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.split('/').pop() || filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    },
    deleteFile: async () => { throw new Error('Delete API not implemented'); },
  }), [uploadConfig.targetDir]);

  const fetchFileListWrapper = useCallback(async () => {
    if (!notebookId) return;
    setIsLoading(true);
    try {
      await fetchFileList({
        notebookId,
        notebookApiIntegration: utilsApi as any,
        setFileList: (list) => setFiles(list as FileNode[]),
        toast,
      });
    } catch (e) {
      console.error('Error fetching files:', e);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [notebookId, toast, utilsApi]);

  useEffect(() => { fetchFileListWrapper(); }, [fetchFileListWrapper]);

  useEffect(() => {
    const h = () => fetchFileListWrapper();
    window.addEventListener('refreshFileList', h as any);
    return () => window.removeEventListener('refreshFileList', h as any);
  }, [fetchFileListWrapper]);

  // 监听父容器宽度 → 设置 tier
  useEffect(() => {
    if (!rootRef.current) return;
    const parent = rootRef.current.parentElement || rootRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setWidthTier(pickTier(w));
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const processedTree: FileNode[] = useMemo(() => {
    if (!files || files.length === 0) return [];
    try {
      if (Array.isArray(files) && typeof files[0] === 'object' && (files[0] as any).type) {
        return files as FileNode[];
      }
      // 扁平 → 树
      const tree: FileNode[] = [];
      const ensureDir = (path: string[], idx: number, base: FileNode[]) => {
        const name = path[idx];
        const curPath = path.slice(0, idx + 1).join('/');
        let dir = base.find((n) => n.type === 'directory' && n.name === name) as FileNodeDirectory | undefined;
        if (!dir) { dir = { name, type:'directory', path:curPath, children:[] }; base.push(dir); }
        return dir.children;
      };
      (files as any[]).forEach((item) => {
        const pathStr = typeof item === 'string' ? item : item.path || item.name;
        if (!pathStr) return;
        const parts = pathStr.split('/').filter(Boolean);
        let cur: FileNode[] = tree;
        for (let i=0;i<parts.length-1;i++) cur = ensureDir(parts, i, cur);
        const fname = parts[parts.length-1]; if (!fname) return;
        cur.push({ name: fname, type:'file', path:pathStr, size: typeof item==='object'? item.size: undefined, lastModified: typeof item==='object'? item.lastModified: undefined } as FileNodeFile);
      });
      return tree;
    } catch (e) {
      console.error('process tree error', e);
      return [];
    }
  }, [files]);

  const handlePreviewFile = useCallback(async (file: FileNodeFile) => {
    try {
      if (!file) { toast({ title:'Error', description:'No file selected for preview', variant:'destructive' }); return; }
      await usePreviewStore.getState().previewFile(notebookId, file.path, {
        file: createPlaceholderFile(file.name, file.lastModified),
      } as any);
    } catch (e) {
      console.error('Error previewing file:', e);
      toast({ title:'Preview Error', description:`Failed to preview ${file?.name || 'file'}`, variant:'destructive' });
    }
  }, [toast, notebookId]);

  const handleFileSelect = useCallback(async (file: FileNodeFile) => {
    if (!file) return;
    
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    
    // 特殊处理 .easynb 文件 - 应该切换到 notebook 模式
    if (ext === 'easynb') {
      console.log(`FileExplorer: Clicked .easynb file: ${file.name}`);
      
      // 直接调用统一的切换函数
      switchToNotebookMode();
      return;
    }
    
    // 其他文件的处理逻辑
    const ps: any = usePreviewStore.getState();
    if (ps?.previewMode !== 'file' && typeof ps?.setPreviewMode === 'function') ps.setPreviewMode('file');
    else if (ps?.previewMode !== 'file' && typeof ps?.changePreviewMode === 'function') ps.changePreviewMode();

    const jsxTypes = ['.jsx','.tsx'];
    const allPreviewable = [...PREVIEWABLE_IMAGE_TYPES, ...PREVIEWABLE_TEXT_TYPES, ...PREVIEWABLE_PDF_TYPES, ...PREVIEWABLE_DOC_TYPES, ...jsxTypes];
    const isPreviewable = allPreviewable.includes(`.${ext}`);
    if (isPreviewable) handlePreviewFile(file);
    else toast({ title: 'File Type Not Supported', description: `Cannot preview ${file.name}. .${ext} not supported.`, variant: 'info' });
  }, [handlePreviewFile, toast, notebookId]);

  /** 选择：目录→切展开；文件→预览 */
  const handleTreeSelect = useCallback((keys: React.Key[], info: { node: FileTreeDataNode }) => {
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
  }, [handleFileSelect]);

  const handleTreeExpand = useCallback((keys: React.Key[]) => setExpandedKeys(keys), []);

  const handleTreeDrop: TreeProps['onDrop'] = useCallback((info: { dragNode: FileTreeDataNode; node: FileTreeDataNode; dropPosition: number }) => {
    const { dragNode, node, dropPosition } = info as any;
    console.log('Tree drop:', { dragKey: dragNode?.key, dropKey: node?.key, dropPosition });
    toast({ title:'Drop Operation', description:'Moving files is not yet implemented', variant:'info' });
  }, [toast]);

  const handleAllowDrop: TreeProps['allowDrop'] = useCallback(({ dropNode }: { dropNode: FileTreeDataNode }) => {
    const node = dropNode as FileTreeDataNode;
    return node?.file?.type === 'directory';
  }, []);

  const handleDownloadFileCb = useCallback((file: FileNodeFile) => {
    handleDownload({ notebookId, filename: file.path, notebookApiIntegration: utilsApi as any, toast });
  }, [notebookId, toast, utilsApi]);

  const handleDeleteFileAction = useCallback((file: FileNodeFile) => {
    if (confirm(`Are you sure you want to delete ${file.name}?`)) {
      handleDeleteFile({ notebookId, filename: file.path, notebookApiIntegration: utilsApi as any, fetchFileList: fetchFileListWrapper, toast });
    }
  }, [notebookId, fetchFileListWrapper, toast, utilsApi]);

  useEffect(() => {
    setTreeData(toTreeData(processedTree));
  }, [processedTree]);

  // 外层拖拽上传
  useEffect(() => {
    const el = dropZoneRef.current; if (!el) return;
    const onDragEnter = (e: DragEvent) => { if (!e.dataTransfer) return; e.preventDefault(); setIsDraggingOver(true); };
    const onDragOver  = (e: DragEvent) => { if (!e.dataTransfer) return; e.preventDefault(); };
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); if (e.target === el) setIsDraggingOver(false); };
    const onDrop      = (e: DragEvent) => {
      e.preventDefault(); setIsDraggingOver(false);
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as File[];
        handleFileUpload({
          notebookId, files, notebookApiIntegration: utilsApi as any, uploadConfig,
          setUploading:(uploading)=>setUploadState((p)=>({ ...p, uploading })),
          setUploadProgress:(progress)=>setUploadState((p)=>({ ...p, progress })),
          setError:(error)=>setUploadState((p)=>({ ...p, error })),
          fileInputRef, setIsPreview:()=>{}, toast, onUpdate:()=>{}, cellId:'', abortControllerRef, fetchFileList: fetchFileListWrapper,
        });
        toast({ title:'Upload Started', description:`Uploading ${files.length} file(s)`, variant:'info' });
      }
    };
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover',  onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop',      onDrop);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragover',  onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop',      onDrop);
    };
  }, [notebookId, uploadConfig, fetchFileListWrapper, toast, utilsApi]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      handleFileUpload({
        notebookId, files, notebookApiIntegration: utilsApi as any, uploadConfig,
        setUploading:(uploading)=>setUploadState((p)=>({ ...p, uploading })),
        setUploadProgress:(progress)=>setUploadState((p)=>({ ...p, progress })),
        setError:(error)=>setUploadState((p)=>({ ...p, error })),
        fileInputRef, setIsPreview:()=>{}, toast, onUpdate:()=>{}, cellId:'', abortControllerRef, fetchFileList: fetchFileListWrapper,
      });
    }
  }, [notebookId, uploadConfig, fetchFileListWrapper, toast, utilsApi]);

  const handleCancelUpload = useCallback(() => { abortControllerRef.current?.abort(); }, []);

  const switchToNotebookMode = useCallback(() => {
    const ps: any = usePreviewStore.getState();
    
    console.log(`FileExplorer: Switching to notebook mode for ${notebookId}`);
    console.log(`FileExplorer: Current previewMode: ${ps?.previewMode}`);
    
    // 1. 导航到workspace路由
    if (notebookId) {
      // 动态导入 useRouteStore 避免循环依赖
      import('@Store/routeStore').then(({ default: useRouteStore }) => {
        useRouteStore.getState().navigateToWorkspace(notebookId);
      });
    }
    
    // 2. 切换到notebook (现在会自动设置previewMode和清除activeFile)
    if (typeof ps?.switchToNotebook === 'function' && notebookId) {
      ps.switchToNotebook(notebookId);
    } else {
      // 如果switchToNotebook不存在，手动处理
      ps.setActiveFile(null);
      if (ps?.previewMode === 'file' && typeof ps?.changePreviewMode === 'function') {
        ps.changePreviewMode();
      }
    }
    
    console.log(`FileExplorer: Notebook switch initiated for ${notebookId}`);
  }, [notebookId]);

  const gapClass = widthTier === 'narrow' ? 'gap-1.5' : 'gap-2';
  const showActions = widthTier !== 'narrow';

  // 如果没有有效的 notebookId，不应该显示任何文件内容
  if (!notebookId) {
    return <div className="text-gray-500 text-sm p-4 text-center">No notebook selected</div>;
  }

  if (isLoading && !files) return <LoadingIndicator text="Loading files..." />;

  return (
    <div ref={rootRef} className="" data-tier={widthTier}>
      <div className="relative">
        {uploadState.uploading && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col justify-center items-center rounded-lg border border-theme-200">
            <div className="mb-3 text-theme-800 font-medium">Uploading files...</div>
            <div className="w-64 h-3 bg-theme-100 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-gradient-to-r from-theme-500 to-theme-600 rounded-full transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
            </div>
            <div className="mt-2 text-theme-700 font-semibold">{uploadState.progress}%</div>
            <button className="mt-4 px-4 py-2 bg-theme-100 text-theme-700 rounded-lg hover:bg-theme-200 transition-colors duration-200 font-medium" onClick={handleCancelUpload}>
              Cancel
            </button>
          </div>
        )}

        {previewLoading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
            <div className="animate-pulse text-theme-700 font-medium">Loading preview...</div>
          </div>
        )}

        {isDraggingOver && (
          <div className="absolute inset-0 border-2 border-dashed border-theme-400 bg-theme-50/60 z-0 rounded-lg animate-pulse" />
        )}

        {previewError && (
          <div className="absolute bottom-4 right-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg shadow-md animate-fade-in">
            <p className="text-sm font-medium">{previewError}</p>
          </div>
        )}

        {/* 主要内容区域 - 不使用 relative，让内容自然流动 */}
        <div className="py-0" ref={dropZoneRef}>
          <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileInputChange} />

          {projectName && (
            <div className="flex items-center justify-between px-3 mb-2 ml-3 mt-3">
              <h2 className="text-[13px] font-bold text-theme-800 p-1 flex-1 min-w-0 break-words" title={projectName}>
                {projectName}
              </h2>
              <button
                className={`p-2 rounded-lg hover:bg-theme-100 text-theme-700 flex-shrink-0 ${NB_TRANSITION}`}
                onClick={fetchFileListWrapper}
                title="Refresh file list"
                aria-label="Refresh file list"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}

        <div className="px-2 mx-2">
          <Tree
            showIcon={false}
            treeData={treeData}
            expandedKeys={expandedKeys}
            selectedKeys={selectedKeys}
            onSelect={handleTreeSelect}
            onExpand={handleTreeExpand}
            onDrop={handleTreeDrop}
            allowDrop={handleAllowDrop}
            draggable={{ icon: false }}
            blockNode
            className="file-explorer-tree"
            style={{ background:'transparent', fontSize:12}}
            titleRender={(node: FileTreeDataNode) => {
              const file = node.file!;
              const isDir = file.type === 'directory';
              const isExpanded = expandedKeys.includes(node.key);
              return (
                <div className={`flex items-start justify-between w-full group ${NB_ROW_H} ${NB_TRANSITION}`}>
                  <div className={`flex items-start ${gapClass} flex-1 min-w-0`}>
                    <span className={NB_ICON_WRAPPER}>
                      {isDir
                        ? (isExpanded ? <FolderOpen size={NB_ICON_SIZE} className={NB_ICON_CLASS} /> 
                                      : <Folder size={NB_ICON_SIZE} className={NB_ICON_CLASS} />)
                        : getFileIcon((file as FileNodeFile).name)}
                    </span>
                    <span className={`${isDir ? NB_TEXT_CLASS : NB_TEXT_CLASS_FILE} flex-1 min-w-0`} title={file.name}>
                      {file.name}
                    </span>
                  </div>

                  {showActions && !isDir && (
                    <Dropdown
                      menu={{ items: getContextMenuItems(file, handlePreviewFile, handleDownloadFileCb, handleDeleteFileAction) }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <button
                        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-gray-100 ${NB_TRANSITION} flex-shrink-0`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="More actions"
                      >
                        <MoreHorizontal size={14} className="text-gray-500" />
                      </button>
                    </Dropdown>
                  )}
                </div>
              );
            }}
          />
        </div>

          {notebookId && (projectName || (tasks && tasks.length > 0)) && (
            <div
              className={`flex items-center py-2 my-0 mx-4 cursor-pointer text-gray-700 hover:bg-theme-50 transition-all duration-200 px-2 rounded-lg`}
              onClick={switchToNotebookMode}
              title="Open Notebook"
            >
              <div className={`flex items-center ${gapClass} flex-1 min-w-0`}>
                <div className="flex-shrink-0">
                  <img src="/icon.svg" className="w-6 h-6" alt="Notebook Icon" />
                </div>
                <span className={`${NB_TEXT_CLASS} flex-1 min-w-0`}>
                  {(projectName || (tasks && tasks.length > 0 ? tasks[0].title : '')) + '.easynb'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const styles = `
.file-explorer-tree {
  overflow: visible;
}
.file-explorer-tree .ant-tree-list-holder{
  overflow: visible;
}

.file-explorer-tree .ant-tree-treenode{
  padding: 0;
  display: flex;
  align-items: center;
}

.file-explorer-tree .ant-tree-node-content-wrapper{
  padding: 2px 6px;
  border-radius: 8px;
  transition: background .15s ease, box-shadow .15s ease;
  display: flex;
  align-items: center;
  flex: 1;
  min-height: 28px;
  line-height: 20px;
}

/* 完全隐藏 switcher 并去掉占位 */
.file-explorer-tree .ant-tree-switcher,
.file-explorer-tree .ant-tree-switcher-noop {
  display: none !important;
  width: 0 !important;
  margin: 0 !important;
}

/* 压缩缩进单元，缓解左侧过宽留白 */
.file-explorer-tree .ant-tree-indent {
  display: inline-flex;
}
.file-explorer-tree .ant-tree-indent-unit {
  width: 12px;
}

/* 隐藏拖拽手柄 */
.file-explorer-tree .ant-tree-draggable-icon{
  display: none !important;
}

/* 避免 antd 内部用于测量的隐藏节点影响布局 */
.file-explorer-tree .ant-tree-treenode[aria-hidden="true"]{
  display: none !important;
  height: 0 !important;
  overflow: hidden !important;
}
`;

if (typeof document !== 'undefined') {
  const styleElement = document.getElementById('file-explorer-custom-styles');
  if (!styleElement) {
    const style = document.createElement('style');
    style.id = 'file-explorer-custom-styles';
    style.textContent = styles;
    document.head.appendChild(style);
  } else {
    styleElement.textContent = styles;
  }
}

export default FileTree;
