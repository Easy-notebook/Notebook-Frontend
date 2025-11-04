// store/previewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { notebookApiIntegration } from '../services/notebookServices';
import { fileLog, storeLog } from '../utils/logger';
import {
  FileCache,
  initializeStorage,
  type FileObject as StorageFileObject,
  type FileType,
  type ActivePreviewMode,
  getFileType,
  getActivePreviewMode,
  getMimeType,
  SplitPreviewCache,
  TabCache
} from '../storage';

/**
 * 预览模式类型
 */
export type PreviewMode = 'notebook' | 'file';

// Re-export types from storage module
export type { FileType, ActivePreviewMode } from '../storage';

/**
 * 文件元数据接口
 */
export interface FileMetadata {
    file: File;
    lastModified?: string | number;
}

// Re-export FileObject from storage module
export type FileObject = StorageFileObject;

/**
 * 预览文件接口（简化版）
 */
export interface PreviewFile {
    id: string;
    path: string;
    name: string;
    type: FileType;
}

/**
 * API 响应接口
 */
export interface FileApiResponse {
    content?: string;
    dataUrl?: string;
    size?: number;
    error?: string;
}

/**
 * Preview Store 状态接口
 */
export interface PreviewStoreState {
    previewMode: PreviewMode;
    currentPreviewFiles: PreviewFile[]; // List of files being previewed
    activeFile: FileObject | null; // Currently active preview file
    activePreviewMode: ActivePreviewMode; // Renderer mode for active file
    dirtyMap: Record<string, boolean>; // fileId -> dirty flag
    isLoading: boolean;
    error: string | null;

    // Current notebook tracking
    currentNotebookId: string | null; // Currently active notebook ID

    // Split preview state - independent from tab system
    activeSplitFile: FileObject | null; // Currently active split preview file
    activeSplitMode: ActivePreviewMode; // Renderer mode for split preview
    isSplitLoading: boolean; // Loading state for split preview
}

/**
 * Preview Store Actions 接口
 */
export interface PreviewStoreActions {
    changePreviewMode: () => void;
    resetToNotebookMode: () => void;
    init: () => void;
    clearError: () => void;
    setCurrentPreviewFiles: (files: PreviewFile[]) => void;
    setActiveFile: (file: FileObject | null) => void;
    setActivePreviewMode: (mode: ActivePreviewMode) => void;
    getCurrentPreviewFiles: () => PreviewFile[];
    previewFile: (notebookId: string, filePath: string, fileMetadata?: FileMetadata) => Promise<FileObject | undefined>;
    getActiveFile: () => FileObject | null;
    closePreviewFile: (fileId: string) => void;
    loadFileById: (fileId: string) => Promise<FileObject | null>;
    deleteFileFromCache: (notebookId: string, filePath: string) => Promise<boolean>;
    clearCacheForNotebook: (notebookId: string) => Promise<boolean>;
    getCSVData: () => string | null;
    updateActiveFileContent: (content: string) => Promise<FileObject | null>;
    setTabDirty: (fileId: string, value: boolean) => void;
    isTabDirty: (fileId: string) => boolean;

    // Notebook-based tab loading
    loadNotebookTabs: (notebookId: string) => Promise<void>;
    switchToNotebook: (notebookId: string) => Promise<void>;
    getCurrentNotebookId: () => string | null;
    getTabsByNotebook: (notebookId: string) => PreviewFile[];

    // Split preview actions - independent from tab system
    previewFileInSplit: (notebookId: string, filePath: string, fileMetadata?: FileMetadata) => Promise<FileObject | undefined>;
    closeSplitPreview: () => void;
    getActiveSplitFile: () => FileObject | null;

    // Tab state persistence
    saveTabState: (notebookId?: string) => Promise<void>;
    loadTabState: (notebookId: string) => Promise<void>;
}

/**
 * 完整的 Preview Store 类型
 */
export type PreviewStore = PreviewStoreState & PreviewStoreActions;

// --- NotebookId-first small helpers (local, decoupled) ---
const FILE_ID_SEP = '::';
const makeFileId = (notebookId: string, filePath: string) => `${notebookId}${FILE_ID_SEP}${filePath}`;
const parseFileId = (fileId: string): { notebookId: string; filePath: string } | null => {
  const idx = fileId.indexOf(FILE_ID_SEP);
  if (idx === -1) return null;
  const notebookId = fileId.slice(0, idx);
  const filePath = fileId.slice(idx + FILE_ID_SEP.length);
  if (!notebookId || !filePath) return null;
  return { notebookId, filePath };
};
const hasNotebookId = (notebookId: string | null | undefined): notebookId is string => {
  if (!notebookId || typeof notebookId !== 'string') {
    storeLog.warn('Invalid notebook ID provided', { received: notebookId, expected: 'string' });
    return false;
  }
  return true;
};



// Create the store
const usePreviewStore = create<PreviewStore>()(
    persist(
        (set, get) => ({
            previewMode: 'notebook',
            currentPreviewFiles: [], // List of files being previewed
            activeFile: null, // Currently active preview file
            activePreviewMode: null,
            dirtyMap: {},
            isLoading: false,
            error: null,

            // Current notebook tracking
            currentNotebookId: null, // Currently active notebook ID

            // Split preview initial state
            activeSplitFile: null,
            activeSplitMode: null,
            isSplitLoading: false,

            changePreviewMode: () => {
                if (get().previewMode === 'notebook') {
                    set({ previewMode: 'file' });
                } else {
                    set({ previewMode: 'notebook' });
                }
            },

            resetToNotebookMode: () => {
                set({ 
                    previewMode: 'notebook',
                    activeFile: null,
                    activePreviewMode: null,
                    currentPreviewFiles: []
                });
            },

            // Initialize the store
            init: async () => {
                try {
                    await initializeStorage();

                    // Clear any stale currentPreviewFiles from localStorage persistence
                    // These should be loaded fresh from TabCache or backend
                    set({ currentPreviewFiles: [], activeFile: null, activePreviewMode: null });

                    // If no current notebook is set, ensure no stale tabs from previous session are shown
                    if (!get().currentNotebookId) {
                        set({ currentPreviewFiles: [], activeFile: null, activePreviewMode: null });
                    }

                    // Restore notebooks from cache after page refresh
                    const cachedNotebooks = await FileCache.getAllNotebooks();
                    storeLog.info(`Restored notebooks from cache`, { count: cachedNotebooks.length, notebooks: cachedNotebooks });

                    // If there's only one cached notebook or a most recently accessed one,
                    // we could potentially restore it as the active notebook
                    if (cachedNotebooks.length > 0) {
                        // Sort by last accessed time to get the most recent
                        const mostRecentNotebook = cachedNotebooks.sort((a, b) =>
                            b.lastAccessedAt - a.lastAccessedAt
                        )[0];

                        storeLog.info('Most recent notebook found', { id: mostRecentNotebook.id, name: mostRecentNotebook.name });

                        // Import and update notebook store with the most recent notebook
                        const { default: useNotebookStore } = await import('./notebookStore');
                        useNotebookStore.getState().setNotebookId(mostRecentNotebook.id);
                        useNotebookStore.getState().setNotebookTitle(mostRecentNotebook.name || `Notebook ${mostRecentNotebook.id.slice(0, 8)}`);

                        // Also set the current notebook ID in preview store
                        set({ currentNotebookId: mostRecentNotebook.id });

                        storeLog.info('Restored notebook context', { notebookId: mostRecentNotebook.id });

                        // Also restore cached files for this notebook
                        try {
                            const cachedFiles = await FileCache.getFilesForNotebook(mostRecentNotebook.id);
                            storeLog.info('Restored cached files for notebook', { notebookId: mostRecentNotebook.id, count: cachedFiles.length });

                            // You can set these in preview state if needed
                            // set({ currentPreviewFiles: cachedFiles.map(file => ({...file})) });

                        } catch (fileError) {
                            storeLog.warn('Failed to restore cached files', { error: fileError });
                        }
                    }

                } catch (error) {
                    storeLog.error('Failed to initialize storage', { error });
                    set({ error: 'Failed to initialize file cache database' });
                }
            },

            // Clear error
            clearError: () => set({ error: null }),

            // Set currently previewed files
            setCurrentPreviewFiles: (files: PreviewFile[]) => set({ currentPreviewFiles: files }),

            // Set active file
            setActiveFile: (file: FileObject | null) => set({ activeFile: file }),

            // Set active preview mode
            setActivePreviewMode: (mode: ActivePreviewMode) => set({ activePreviewMode: mode }),

            getCurrentPreviewFiles: () => get().currentPreviewFiles,

            // Fetch and preview a file
            previewFile: async (notebookId: string, filePath: string, fileMetadata: FileMetadata = {} as FileMetadata): Promise<FileObject | undefined> => {
                set({ isLoading: true, error: null });

                // Generate a unique ID for the file
                const fileId = makeFileId(notebookId, filePath);

                // Check if file exists in cache with optimized query
                const cachedFile = await FileCache.getFile(notebookId, filePath);
                const lastModifiedBackend = fileMetadata.lastModified || null;
                let file = fileMetadata.file;
                if (!file) {
                    // Create a safe placeholder File when not provided (derive name from path)
                    try {
                        const baseName = filePath.split('/').pop() || filePath;
                        const mime = getMimeType(filePath);
                        file = new File([''], baseName, { type: mime, lastModified: Date.now() });
                    } catch (e) {
                        fileLog.warn('Failed to create placeholder File', { error: e, baseName, mime });
                    }
                }
                if (!file) {
                    set({ error: 'File not found', isLoading: false });
                    return;
                }

                // Determine if we need to fetch from backend
                const needsFetch = !cachedFile ||
                    (lastModifiedBackend && cachedFile.lastModified !== lastModifiedBackend);


                if (needsFetch) {
                    try {
                        // Try multiple path variations for better compatibility
                        let response: FileApiResponse | null = null;
                        const pathsToTry = [
                            filePath,
                            `.assets/${filePath}`,
                            filePath.split('/').pop() || filePath  // Just filename
                        ];
                        
                        for (const pathToTry of pathsToTry) {
                            try {
                                response = await notebookApiIntegration.getFile(notebookId, pathToTry);
                                if (response && !response.error) {
                                    fileLog.debug('File found at path', { originalPath: filePath, resolvedPath: pathToTry });
                                    break;
                                }
                            } catch (tryError) {
                                continue; // Try next path
                            }
                        }
                        
                        // If no path worked, throw the original error
                        if (!response) {
                            response = await notebookApiIntegration.getFile(notebookId, filePath);
                        }

                        if (!response || response.error) {
                            throw new Error(response?.error || 'Failed to fetch file');
                        }

                        // Determine the file content and type
                        let content = response.content || '';
                        const fileType = getFileType(filePath);
                        fileLog.typeDetection(filePath, fileType, 1.0, false);

                        // Special handling for xlsx files that might be cached as 'text'
                        const fileExt = filePath.split('.').pop()?.toLowerCase();
                        if (fileExt === 'xlsx' || fileExt === 'xls') {
                            fileLog.debug('Forcing xlsx type for Excel file', { filePath, fileExt });
                            // Ensure xlsx files are treated as xlsx, not text
                        }

                        // Handle specific file types
                        if (fileType === 'image') {
                            // For images, content should be the data URL
                            if (typeof content === 'string' && content.startsWith('data:')) {
                                // Already in correct format
                            } else {
                                // Convert to data URL if needed
                                const fileExt = filePath.split('.').pop()?.toLowerCase();
                                content = response.dataUrl || `data:image/${fileExt};base64,${content}`;
                            }
                        } else if (fileType === 'pdf') {
                            // For PDFs, build data URL. If content empty, fall back to served assets URL
                            if (typeof content === 'string' && content.startsWith('data:')) {
                                // Already data URL
                            } else {
                                const dataUrl = content ? `data:application/pdf;base64,${content}` : '';
                                let assetsUrl = '';
                                try {
                                    const base = window.Backend_BASE_URL ? window.Backend_BASE_URL.replace(/\/$/, '') : '';
                                    const name = filePath.split('/').pop() || filePath;
                                    assetsUrl = `${base}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
                                } catch {}
                                content = dataUrl || assetsUrl;
                            }
                        } else if (fileType === 'docx') {
                            // For DOC/DOCX files, content should be base64 or data URL for binary files
                            fileLog.processing('parse', filePath, {
                                type: 'docx',
                                contentType: typeof content,
                                contentLength: content ? content.length : 0,
                                hasContent: !!content
                            });

                            if (typeof content === 'string' && content.startsWith('data:')) {
                                fileLog.debug('Content is already data URL format', { filePath });
                                // Already data URL format
                            } else if (content) {
                                // Convert to data URL for binary handling
                                fileLog.debug('Converting to data URL format', { filePath });
                                const mimeType = fileExt === 'doc' ?
                                    'application/msword' :
                                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                                content = `data:${mimeType};base64,${content}`;
                                fileLog.debug('Conversion completed', { filePath, finalLength: content.length });
                            } else {
                                fileLog.error('No content received for DOCX file', { filePath });
                            }
                        }

                        // Create file object data for cache
                        const fileObjectData = {
                            id: fileId,
                            notebookId,
                            path: filePath,
                            name: file.name,
                            content,
                            type: fileType,
                            lastModified: String(lastModifiedBackend || new Date().toISOString()),
                            size: response.size || 0
                        };

                        // Save to optimized IndexedDB
                        await FileCache.saveFile(fileObjectData);

                        // Create full file object for state
                        const fileObject: FileObject = {
                            ...fileObjectData,
                            cachedAt: Date.now(),
                            accessCount: 1,
                            lastAccessed: Date.now()
                        };

                        // Set as active file and renderer mode
                        const activeMode = getActivePreviewMode(fileType);
                        set({
                            activeFile: fileObject,
                            activePreviewMode: activeMode,
                            isLoading: false
                        });

                        // Update current preview files list - better management
                        const { currentPreviewFiles } = get();
                        const existingFileIndex = currentPreviewFiles.findIndex(f => f.id === fileId);

                        let updatedFiles: PreviewFile[];
                        if (existingFileIndex >= 0) {
                            // Update existing file in the list
                            updatedFiles = [...currentPreviewFiles];
                            updatedFiles[existingFileIndex] = {
                                id: fileId,
                                path: filePath,
                                name: file.name,
                                type: fileType
                            };
                        } else {
                            // Add new file to the list
                            updatedFiles = [...currentPreviewFiles, {
                                id: fileId,
                                path: filePath,
                                name: file.name,
                                type: fileType
                            }];
                        }

                        set({ currentPreviewFiles: updatedFiles });
                        
                        // Save updated tab state to storage
                        get().saveTabState(notebookId).catch(error => {
                            storeLog.error('Failed to save tab state after adding new file', { error, notebookId, filePath });
                        });
                        
                        return fileObject;
                    } catch (e: any) {
                        const msg = (e && e.message) ? String(e.message) : '';
                        fileLog.error('File fetch error', { message: msg, filePath });

                        const isNotFound = /not\s*found/i.test(msg) || /404/.test(msg);

                        // If it's a 404 error, don't create tabs for missing files
                        if (isNotFound) {
                            fileLog.warn('File not found - will not create tab', { filePath });
                            set({ isLoading: false, error: null }); // Clear error, don't show to user
                            return undefined; // Return undefined instead of throwing
                        }

                        // For non-404 errors, try fallbacks
                        const baseName = filePath.split('/').pop() || filePath;

                        if (baseName !== filePath) {
                            fileLog.info('Trying fallback to basename', { original: filePath, fallback: baseName });
                            try {
                                return await get().previewFile(notebookId, baseName, fileMetadata);
                            } catch (fallbackError) {
                                fileLog.warn('Basename fallback failed', { error: fallbackError, baseName });
                            }
                        }

                        // Try URL encoding the file path
                        if (filePath.includes(' ')) {
                            fileLog.info('Trying URL encoded path', { filePath });
                            const encodedPath = filePath.split('/').map(part => encodeURIComponent(part)).join('/');
                            if (encodedPath !== filePath) {
                                try {
                                    return await get().previewFile(notebookId, encodedPath, fileMetadata);
                                } catch (encodingError) {
                                    fileLog.warn('URL encoding fallback failed', { error: encodingError, encodedPath });
                                }
                            }
                        }

                        // All fallbacks failed, don't create a tab
                        set({ isLoading: false, error: null }); // Clear error, don't show to user
                        fileLog.warn('All file load attempts failed - no tab will be created', { filePath });
                        return undefined; // Return undefined instead of throwing
                    }
                } else {
                    // File found in cache
                    const cachedMode = getActivePreviewMode(cachedFile.type as FileType);
                    set({
                        activeFile: cachedFile,
                        activePreviewMode: cachedMode,
                        isLoading: false
                    });

                    // Update current preview files list - better management for cached files
                    const { currentPreviewFiles } = get();
                    const existingFileIndex = currentPreviewFiles.findIndex(f => f.id === fileId);

                    let updatedFiles: PreviewFile[];
                    if (existingFileIndex >= 0) {
                        // Update existing file in the list
                        updatedFiles = [...currentPreviewFiles];
                        updatedFiles[existingFileIndex] = {
                            id: fileId,
                            path: filePath,
                            name: file.name,
                            type: getFileType(filePath)
                        };
                    } else {
                        // Add new file to the list
                        updatedFiles = [...currentPreviewFiles, {
                            id: fileId,
                            path: filePath,
                            name: file.name,
                            type: getFileType(filePath)
                        }];
                    }

                    set({ currentPreviewFiles: updatedFiles });
                    
                    // Save updated tab state to storage
                    get().saveTabState(notebookId).catch(error => {
                        storeLog.error('Failed to save tab state after loading cached file', { error, notebookId, filePath });
                    });
                    
                    return cachedFile;
                }
            },

            getActiveFile: () => get().activeFile,

            // Close a preview file
            closePreviewFile: (fileId: string) => {
                const { currentPreviewFiles, activeFile, dirtyMap, currentNotebookId } = get();

                fileLog.tabManagement('close', fileId);

                // Compute next active before removal to preserve adjacency
                const closedIndex = currentPreviewFiles.findIndex(f => f.id === fileId);
                const updatedFiles = currentPreviewFiles.filter(f => f.id !== fileId);

                // Clean dirty flag for closed tab
                const { [fileId]: _, ...nextDirtyMap } = dirtyMap;

                // If it was the active file, set a new active file or null
                if (activeFile && activeFile.id === fileId) {
                    if (updatedFiles.length > 0) {
                        // Prefer the neighbor at the same index; fallback to last index available
                        const nextIndex = Math.min(closedIndex, updatedFiles.length - 1);
                        const nextId = updatedFiles[nextIndex].id;
                        get().loadFileById(nextId).then((newActiveFile) => {
                            set({
                                currentPreviewFiles: updatedFiles,
                                activeFile: newActiveFile,
                                dirtyMap: nextDirtyMap
                            });
                            
                            // Save updated state to storage
                            if (currentNotebookId) {
                                get().saveTabState(currentNotebookId).catch(error => {
                                    storeLog.error('Failed to save tab state after closing file', { error, fileId });
                                });
                            }
                        });
                    } else {
                        set({
                            currentPreviewFiles: updatedFiles,
                            activeFile: null,
                            activePreviewMode: null,
                            dirtyMap: nextDirtyMap
                        });
                        
                        // Save updated state to storage
                        if (currentNotebookId) {
                            get().saveTabState(currentNotebookId).catch(error => {
                                storeLog.error('Failed to save tab state after closing last file', { error, fileId });
                            });
                        }
                    }
                } else {
                    // Just update the files list
                    set({ currentPreviewFiles: updatedFiles, dirtyMap: nextDirtyMap });
                    
                    // Save updated state to storage
                    if (currentNotebookId) {
                        get().saveTabState(currentNotebookId).catch(error => {
                            storeLog.error('Failed to save tab state after closing inactive file', { error, fileId });
                        });
                    }
                }

                fileLog.tabManagement('close', `Tab closed: ${fileId}`, { remainingTabs: updatedFiles.length });
            },

            // Load a file by its ID
            loadFileById: async (fileId: string): Promise<FileObject | null> => {
                try {
                    fileLog.fileOperation('open', fileId);

                    const parsed = parseFileId(fileId);
                    if (!parsed) {
                        fileLog.error('Invalid fileId format', { fileId });
                        return null;
                    }
                    const { notebookId, filePath } = parsed;

                    // Validate extracted values
                    if (!notebookId || !filePath) {
                        fileLog.error('Invalid fileId components', { fileId, notebookId, filePath });
                        return null;
                    }

                    // Check cache first
                    const cachedFile = await FileCache.getFile(notebookId, filePath);
                    if (cachedFile) {
                        fileLog.info('Found file in cache', { filePath });
                        // Set active preview mode based on file type
                        const previewMode = getActivePreviewMode(cachedFile.type as FileType);

                        set({
                            activeFile: cachedFile,
                            activePreviewMode: previewMode
                        });
                        return cachedFile;
                    }

                    // Try to fetch from server, but handle errors gracefully
                    try {
                        fileLog.info('Attempting to fetch file from server', { filePath });
                        const fetched = await get().previewFile(notebookId, filePath);
                        if (fetched) {
                            fileLog.info('Successfully fetched and loaded file', { filePath });
                            return fetched;
                        } else {
                            fileLog.warn('File fetch returned undefined', { filePath });
                            return null;
                        }
                    } catch (e: any) {
                        const msg = e?.message || String(e);
                        const isNotFound = /not\s*found/i.test(msg) || /404/.test(msg);

                        if (isNotFound) {
                            fileLog.warn('File not found on server - this is normal for missing files', { filePath });

                            // Remove this tab from the preview files list since the file doesn't exist
                            const { currentPreviewFiles } = get();
                            const updatedFiles = currentPreviewFiles.filter(f => f.id !== fileId);

                            set({
                                currentPreviewFiles: updatedFiles,
                                error: null // Don't show error to user for missing files
                            });

                            return null;
                        } else {
                            fileLog.error('Error loading file', { filePath, error: e });
                            return null;
                        }
                    }
                } catch (error) {
                    fileLog.error('Error loading file by ID', { error });
                    return null;
                }
            },

            // Delete a file from cache
            deleteFileFromCache: async (notebookId: string, filePath: string): Promise<boolean> => {
                try {
                    await FileCache.deleteFile(notebookId, filePath);

                    // Update state if needed
                    const fileId = makeFileId(notebookId, filePath);
                    const { currentPreviewFiles } = get();

                    // Remove from preview files list
                    if (currentPreviewFiles.some(f => f.id === fileId)) {
                        get().closePreviewFile(fileId);
                    }

                    return true;
                } catch (error) {
                    fileLog.error('Error deleting file from cache', { error });
                    set({ error: 'Failed to delete file from cache' });
                    return false;
                }
            },

            // Clear all files for a notebook
            clearCacheForNotebook: async (notebookId: string): Promise<boolean> => {
                try {
                    await FileCache.clearNotebookCache(notebookId);

                    // Update state
                    const { currentPreviewFiles } = get();
                    const updatedFiles = currentPreviewFiles.filter(
                        f => !f.id.startsWith(`${notebookId}::`)
                    );

                    // Handle active file and preview mode setting
                    if (updatedFiles.length > 0) {
                        const activeFile = await get().loadFileById(updatedFiles[0].id);
                        const activePreviewMode = activeFile
                            ? getActivePreviewMode(activeFile.type as FileType)
                            : 'default';

                        set({
                            currentPreviewFiles: updatedFiles,
                            activeFile: activeFile,
                            activePreviewMode: activePreviewMode
                        });
                    } else {
                        set({
                            currentPreviewFiles: updatedFiles,
                            activeFile: null,
                            activePreviewMode: null
                        });
                    }

                    return true;
                } catch (error) {
                    fileLog.error('Error clearing notebook cache', { error });
                    set({ error: 'Failed to clear notebook cache' });
                    return false;
                }
            },

            // Get CSV data for CSVPreviewApp
            getCSVData: (): string | null => {
                const { activeFile } = get();
                if (!activeFile || activeFile.type !== 'csv') return null;

                try {
                    if (typeof activeFile.content === 'string') {
                        return activeFile.content;
                    }
                    return null;
                } catch (error) {
                    fileLog.error('Error getting CSV data', { error });
                    return null;
                }
            },

            // Update active file content and keep cache consistent
            updateActiveFileContent: async (content: string): Promise<FileObject | null> => {
                const state = get();
                const file = state.activeFile;
                if (!file) return null;

                const updated: FileObject = { ...file, content };

                // Transform to match FileCache.saveFile expected format
                const cacheData = {
                    notebookId: updated.notebookId,
                    filePath: updated.path,
                    fileName: updated.name,
                    content: updated.content,
                    lastModified: updated.lastModified,
                    size: updated.size
                };

                if (!hasNotebookId(updated.notebookId)) {
                    set({ isLoading: false });
                    return null;
                }

                await FileCache.saveFile(cacheData);
                set({ activeFile: updated });
                return updated;
            },

            setTabDirty: (fileId: string, value: boolean) => {
                set((s) => ({ dirtyMap: { ...s.dirtyMap, [fileId]: value } }));
            },

            isTabDirty: (fileId: string): boolean => {
                return !!get().dirtyMap[fileId];
            },

            // Load tabs for a specific notebook
            loadNotebookTabs: async (notebookId: string): Promise<void> => {
                try {
                    storeLog.info('Loading tabs for notebook', { notebookId });

                    set({ isLoading: true, error: null });

                    // 🔍 Get current state to check if we're switching notebooks
                    const currentState = get();
                    const currentNotebookId = currentState.getCurrentNotebookId();

                    if (currentNotebookId && currentNotebookId !== notebookId) {
                        storeLog.info('Switching notebooks', { from: currentNotebookId, to: notebookId });
                        // Clear all tabs when switching notebooks
                        set({
                            currentPreviewFiles: [],
                            activeFile: null,
                            activePreviewMode: null
                        });
                    } else if (currentNotebookId === notebookId) {
                        storeLog.info('Already on notebook - refreshing tabs', { notebookId });
                    }

                    // 📂 Get files from storage (only for current notebook)
                    let files: any[] = [];
                    try {
                        const { FileORM } = await import('../storage');
                        const fileResults = await FileORM.getFilesForNotebook(notebookId, false); // Don't load content for tabs

                        // 🔍 Filter out notebook main files and invalid files
                        const filteredResults = fileResults.filter(result => {
                            const filePath = result.metadata.filePath;
                            const fileName = result.metadata.fileName;

                            // Skip notebook main files (they shouldn't be tabs)
                            if (filePath.startsWith('notebook_') && filePath.endsWith('.json')) {
                                storeLog.debug('Skipping notebook main file', { fileName });
                                return false;
                            }

                            // Skip .easynb files (they are notebook files, not separate tabs)
                            if (fileName.endsWith('.easynb')) {
                                storeLog.debug('Skipping .easynb file', { fileName });
                                return false;
                            }

                            return true;
                        });

                        files = filteredResults.map(result => ({
                            id: makeFileId(notebookId, result.metadata.filePath),
                            path: result.metadata.filePath,
                            name: result.metadata.fileName,
                            type: result.metadata.fileType,
                            lastModified: result.metadata.lastModified,
                            size: result.metadata.size,
                            notebookId: result.metadata.notebookId,
                            exists: true
                        }));

                        storeLog.info('Found valid files for tabs', { validCount: files.length, totalCount: fileResults.length });

                        // 🔄 Also fetch files from backend for this notebook and merge
                        try {
                            const resp = await notebookApiIntegration.listFiles(notebookId);
                            if (resp && (resp as any).status === 'ok' && Array.isArray((resp as any).files)) {
                                const nodes = (resp as any).files as any[];
                                const flatten = (arr: any[]): any[] => arr.flatMap((n) => (
                                    n && n.type === 'directory' && Array.isArray(n.children) ? flatten(n.children) : [n]
                                ));
                                const flatFiles = flatten(nodes);
                                const filteredBackend = flatFiles.filter((f) => {
                                    const fileName = f?.name || '';
                                    const filePath = f?.path || f?.name || '';
                                    if (filePath.startsWith('notebook_') && filePath.endsWith('.json')) return false;
                                    if (fileName.endsWith('.easynb')) return false;
                                    return true;
                                });
                                const backendFiles = filteredBackend.map((f) => ({
                                    id: makeFileId(notebookId, f.path || f.name),
                                    path: f.path || f.name,
                                    name: f.name,
                                    type: getFileType((f.path || f.name) as string),
                                }));

                                // Merge storage files and backend files by path
                                const byPath = new Map<string, any>();
                                files.forEach((x) => byPath.set(x.path, x));
                                backendFiles.forEach((x) => { if (!byPath.has(x.path)) byPath.set(x.path, x); });
                                files = Array.from(byPath.values());
                                storeLog.info('Merged files from storage+backend', { count: files.length });
                            }
                        } catch (e) {
                            storeLog.warn('Backend listFiles failed', { error: e });
                        }

                    } catch (storageError) {
                        storeLog.warn('Storage system failed', { error: storageError });
                        files = [];
                    }

                    // 🏷️ Convert to PreviewFile format with additional validation
                    const { validateFileForTab } = await import('../utils/fileValidation');

                    const previewFiles: PreviewFile[] = files
                        .filter(file => {
                            const validation = validateFileForTab(file.path || '', file.name || '', '');

                            if (!validation.isValid) {
                                storeLog.debug('Skipping invalid file', { fileName: file.name, reason: validation.reason });
                                return false;
                            }

                            return true;
                        })
                        .map(file => ({
                            id: file.id || `${notebookId}::${file.path}`,
                            path: file.path,
                            name: file.name,
                            type: getFileType(file.path || file.name) as FileType
                        }));

                    storeLog.info('Processed valid preview files for tabs', { count: previewFiles.length });

                    // 🎯 Only set tabs for current notebook (no auto-active file)
                    // Guard: do not show stale tabs if notebook no longer matches
                    const stillCurrent = get().currentNotebookId === notebookId && !!notebookId;
                    if (!stillCurrent) {
                        set({ currentPreviewFiles: [], activeFile: null, activePreviewMode: null, isLoading: false });
                        storeLog.info('Cleared tabs due to no active notebook');
                        return;
                    }
                    set({
                        currentPreviewFiles: previewFiles,
                        activeFile: null, // Don't auto-activate any file
                        activePreviewMode: null,
                        isLoading: false
                    });

                    storeLog.info('Loaded tabs for notebook (safe mode)', { count: previewFiles.length, notebookId });
                } catch (error) {
                    storeLog.error('Failed to load tabs for notebook', { notebookId, error });
                    set({
                        error: `Failed to load notebook tabs: ${error}`,
                        isLoading: false
                    });
                }
            },

            // Switch to a different notebook and load its tabs
            switchToNotebook: async (notebookId: string): Promise<void> => {
                try {
                    storeLog.info('Switching to notebook', { notebookId });

                    // Save current notebook's tab state before switching
                    const currentNotebookId = get().currentNotebookId;
                    if (currentNotebookId && currentNotebookId !== notebookId) {
                        await get().saveTabState(currentNotebookId);
                    }

                    // Update notebook store
                    const { default: useNotebookStore } = await import('./notebookStore');
                    const notebookStore = useNotebookStore.getState();

                    // Load notebook content from database
                    const loaded = await notebookStore.loadFromDatabase(notebookId);
                    if (!loaded) {
                        storeLog.warn('Could not load notebook from database', { notebookId });
                    }

                    // Set current notebook ID and switch to notebook mode
                    // 不立即清空tab列表，让loadTabState来处理
                    set({ 
                        currentNotebookId: notebookId,
                        previewMode: 'notebook',  // 确保切换到notebook预览模式
                        activeFile: null,  // 清除活跃文件
                        activePreviewMode: null
                    });

                    // Load tabs from saved state or from scratch
                    await get().loadTabState(notebookId);

                    storeLog.info('Successfully switched to notebook', { notebookId, previewMode: 'notebook' });
                } catch (error) {
                    storeLog.error('Failed to switch to notebook', { notebookId, error });
                    set({ error: `Failed to switch notebook: ${error}` });
                }
            },

            // Get current notebook ID
            getCurrentNotebookId: (): string | null => {
                return get().currentNotebookId;
            },

            // Get tabs filtered by notebook ID
            getTabsByNotebook: (notebookId: string): PreviewFile[] => {
                const { currentPreviewFiles } = get();
                return currentPreviewFiles.filter(file =>
                    file.id.startsWith(`${notebookId}::`)
                );
            },

            // Split preview methods - independent from tab system
            previewFileInSplit: async (notebookId: string, filePath: string, fileMetadata: FileMetadata = {} as FileMetadata): Promise<FileObject | undefined> => {
                set({ isSplitLoading: true, error: null });

                fileLog.info('Split preview: Loading file', { filePath, notebookId });

                try {
                    // Generate a unique ID for the file
                    const fileId = makeFileId(notebookId, filePath);

                    // Check if file exists in split preview cache (independent from tabs)
                    const cachedFile = await SplitPreviewCache.getFile(notebookId, filePath);
                    const lastModifiedBackend = fileMetadata.lastModified || null;

                    let file = fileMetadata.file;
                    if (!file) {
                        // Create a safe placeholder File when not provided
                        try {
                            const baseName = filePath.split('/').pop() || filePath;
                            const mime = getMimeType(filePath);
                            file = new File([''], baseName, { type: mime, lastModified: Date.now() });
                        } catch (e) {
                            fileLog.warn('Failed to create placeholder File for split preview', { error: e });
                        }
                    }

                    if (!file) {
                        set({ error: 'File not found for split preview', isSplitLoading: false });
                        return;
                    }

                    // Determine if we need to fetch from backend
                    const needsFetch = !cachedFile || (lastModifiedBackend && cachedFile.lastModified !== lastModifiedBackend);

                    let fileObject: FileObject;

                    if (needsFetch) {
                        fileLog.info('Split preview: Fetching from backend', { filePath });

                        // Get file from backend
                        const response: FileApiResponse = await notebookApiIntegration.getFile(notebookId, filePath);

                        if (!response || response.error) {
                            throw new Error(response?.error || 'Failed to fetch file for split preview');
                        }

                        // Process file content based on type (similar to regular preview)
                        let content = response.content || '';
                        const fileType = getFileType(filePath);

                        if (fileType === 'image') {
                            if (typeof content === 'string' && content.startsWith('data:')) {
                                // Already in correct format
                            } else {
                                const fileExt = filePath.split('.').pop()?.toLowerCase();
                                content = response.dataUrl || `data:image/${fileExt};base64,${content}`;
                            }
                        } else if (fileType === 'pdf') {
                            if (typeof content === 'string' && content.startsWith('data:')) {
                                // Already data URL
                            } else {
                                const dataUrl = content ? `data:application/pdf;base64,${content}` : '';
                                let assetsUrl = '';
                                try {
                                    const base = window.Backend_BASE_URL ? window.Backend_BASE_URL.replace(/\/$/, '') : '';
                                    const name = filePath.split('/').pop() || filePath;
                                    assetsUrl = `${base}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`;
                                } catch {}
                                content = dataUrl || assetsUrl;
                            }
                        } else if (fileType === 'docx') {
                            if (typeof content === 'string' && content.startsWith('data:')) {
                                // Already data URL format
                            } else if (content) {
                                const fileExt = filePath.split('.').pop()?.toLowerCase();
                                const mimeType = fileExt === 'doc' ?
                                    'application/msword' :
                                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                                content = `data:${mimeType};base64,${content}`;
                            }
                        }

                        // Create file object (fill required fields for FileObject)
                        fileObject = {
                            id: fileId,
                            notebookId,
                            name: file.name,
                            path: filePath,
                            content,
                            type: fileType,
                            size: file.size,
                            lastModified: new Date(lastModifiedBackend || Date.now()).toISOString(),
                            cachedAt: Date.now(),
                            accessCount: 1,
                            lastAccessed: Date.now()
                        };

                        // Cache the file for future use in split preview cache (independent from tabs)
                        await SplitPreviewCache.saveFile(notebookId, filePath, {
                            name: fileObject.name,
                            content: fileObject.content,
                            type: fileObject.type,
                            size: fileObject.size,
                            lastModified: fileObject.lastModified
                        });

                    } else {
                        fileLog.info('Split preview: Using cached file', { filePath });
                        // Convert SplitFileData to FileObject format (fill required fields)
                        fileObject = {
                            id: cachedFile.id,
                            notebookId: cachedFile.notebookId,
                            name: cachedFile.fileName,
                            path: cachedFile.filePath,
                            content: cachedFile.content,
                            type: cachedFile.type as FileType,
                            size: cachedFile.size,
                            lastModified: cachedFile.lastModified,
                            cachedAt: cachedFile.cachedAt,
                            accessCount: 1,
                            lastAccessed: Date.now()
                        };
                    }

                    // Set split preview state
                    const splitMode = getActivePreviewMode(fileObject.type as FileType);
                    set({
                        activeSplitFile: fileObject,
                        activeSplitMode: splitMode,
                        isSplitLoading: false,
                        error: null
                    });

                    fileLog.info('Split preview loaded successfully', { filePath });
                    return fileObject;

                } catch (error) {
                    fileLog.error('Split preview failed', { filePath, error });
                    set({
                        isSplitLoading: false,
                        error: `Failed to load file in split preview: ${error}`,
                        activeSplitFile: null,
                        activeSplitMode: null
                    });
                    return undefined;
                }
            },

            closeSplitPreview: () => {
                fileLog.info('Closing split preview');
                set({
                    activeSplitFile: null,
                    activeSplitMode: null,
                    isSplitLoading: false,
                    error: null
                });
            },

            getActiveSplitFile: (): FileObject | null => {
                return get().activeSplitFile;
            },

            // Save current tab state to storage
            saveTabState: async (notebookId?: string): Promise<void> => {
                const state = get();
                const targetNotebookId = notebookId || state.currentNotebookId;
                
                if (!targetNotebookId) {
                    storeLog.warn('No notebookId provided for saving tab state');
                    return;
                }

                try {
                    const activeTabId = state.activeFile?.id || null;
                    await TabCache.saveTabState(targetNotebookId, state.currentPreviewFiles, activeTabId);
                    storeLog.info('Saved tab state for notebook', { notebookId: targetNotebookId, tabCount: state.currentPreviewFiles.length, activeTabId });
                } catch (error) {
                    storeLog.error('Failed to save tab state', { error });
                }
            },

            // Load tab state from storage
            loadTabState: async (notebookId: string): Promise<void> => {
                try {
                    const tabState = await TabCache.getTabState(notebookId);
                    
                    if (tabState && tabState.tabList.length > 0) {
                        storeLog.info('Loading saved tab state for notebook', { notebookId, tabCount: tabState.tabList.length });
                        
                        // Validate each cached tab before restoration
                        const validTabs: PreviewFile[] = [];
                        const invalidTabIds: string[] = [];
                        
                        for (const tab of tabState.tabList) {
                            try {
                                // Test if the file can be loaded without actually setting it as active
                                const parsed = parseFileId(tab.id);
                                if (!parsed) {
                                    storeLog.warn('Invalid tab ID format', { tabId: tab.id });
                                    invalidTabIds.push(tab.id);
                                    continue;
                                }
                                
                                const { notebookId: tabNotebookId, filePath } = parsed;
                                
                                // Check if file exists in cache or can be fetched
                                const cachedFile = await FileCache.getFile(tabNotebookId, filePath);
                                if (cachedFile) {
                                    // File exists in cache, add to valid tabs
                                    validTabs.push({
                                        id: tab.id,
                                        path: tab.path,
                                        name: tab.name,
                                        type: tab.type as FileType
                                    });
                                    storeLog.debug('Tab validated from cache', { tabPath: tab.path });
                                } else {
                                    // Try to fetch from backend to validate existence
                                    let validationSuccess = false;
                                    const pathsToTry = [
                                        filePath,
                                        `.assets/${filePath}`,  // Try with .assets prefix
                                        filePath.split('/').pop()  // Try just the filename
                                    ].filter(Boolean);
                                    
                                    for (const pathToTry of pathsToTry) {
                                        try {
                                            const response = await notebookApiIntegration.getFile(tabNotebookId, pathToTry);
                                            if (response && !response.error) {
                                                // File exists on backend, add to valid tabs
                                                validTabs.push({
                                                    id: tab.id,
                                                    path: tab.path,
                                                    name: tab.name,
                                                    type: tab.type as FileType
                                                });
                                                storeLog.debug('Tab validated from backend', { 
                                                    tabPath: tab.path, 
                                                    resolvedPath: pathToTry 
                                                });
                                                validationSuccess = true;
                                                break;
                                            }
                                        } catch (fetchError) {
                                            // Continue to next path
                                            continue;
                                        }
                                    }
                                    
                                    if (!validationSuccess) {
                                        storeLog.warn('Tab file no longer exists at any expected path, removing from cache', { 
                                            tabPath: tab.path,
                                            triedPaths: pathsToTry 
                                        });
                                        invalidTabIds.push(tab.id);
                                    }
                                }
                            } catch (validationError) {
                                storeLog.warn('Tab validation failed', { 
                                    tabPath: tab.path, 
                                    error: validationError.message 
                                });
                                invalidTabIds.push(tab.id);
                            }
                        }

                        // Set only valid tabs
                        set({ 
                            currentPreviewFiles: validTabs,
                            currentNotebookId: notebookId
                        });

                        // Try to restore active tab if it's still valid
                        let activeTabRestored = false;
                        if (tabState.activeTabId && !invalidTabIds.includes(tabState.activeTabId)) {
                            try {
                                const activeFile = await get().loadFileById(tabState.activeTabId);
                                if (activeFile) {
                                    const activePreviewMode = getActivePreviewMode(activeFile.type as FileType);
                                    set({ 
                                        activeFile,
                                        activePreviewMode 
                                    });
                                    activeTabRestored = true;
                                    storeLog.info('Active tab restored successfully', { activeTabId: tabState.activeTabId });
                                }
                            } catch (error) {
                                storeLog.warn('Failed to restore active tab', { error, activeTabId: tabState.activeTabId });
                            }
                        }

                        // Update cache to remove invalid tabs
                        if (invalidTabIds.length > 0) {
                            try {
                                await TabCache.saveTabState(
                                    notebookId, 
                                    validTabs, 
                                    activeTabRestored ? tabState.activeTabId : null
                                );
                                storeLog.info('Updated tab cache, removed invalid tabs', { 
                                    removedCount: invalidTabIds.length,
                                    validCount: validTabs.length 
                                });
                            } catch (updateError) {
                                storeLog.error('Failed to update tab cache after validation', { error: updateError });
                            }
                        }

                        storeLog.info('Restored validated tabs for notebook', { 
                            notebookId, 
                            validCount: validTabs.length, 
                            invalidCount: invalidTabIds.length 
                        });
                        return;
                    }

                    storeLog.info('No saved tab state found - loading from scratch', { notebookId });
                } catch (error) {
                    storeLog.error('Failed to load tab state', { error });
                }

                // Fallback to regular tab loading if no saved state or error
                await get().loadNotebookTabs(notebookId);
            },

        }),
        {
            name: 'preview-store',
            partialize: (state) => ({
                // Don't persist currentPreviewFiles - they should be loaded from TabCache or fresh
                // currentPreviewFiles: state.currentPreviewFiles,
                currentNotebookId: state.currentNotebookId,
                previewMode: state.previewMode,
                dirtyMap: state.dirtyMap
            })
        }
    )
);

// Initialize IndexedDB when the store is first used
usePreviewStore.getState().init();

// Clean up any stale localStorage data containing invalid file references
// This is a one-time cleanup for existing users
try {
    const storedData = localStorage.getItem('preview-store');
    if (storedData) {
        const parsed = JSON.parse(storedData);
        if (parsed?.state?.currentPreviewFiles) {
            // Check if there are any suspicious file references
            const suspiciousFiles = parsed.state.currentPreviewFiles.filter(
                (file: any) => file.path && (
                    file.path.includes('sa_balance_exp.xlsx') ||
                    file.path.includes('balance_exp') ||
                    // Add other problematic patterns as needed
                    !file.path.includes('.assets/') && file.path.match(/\.(xlsx?|csv|pdf)$/i)
                )
            );
            
            if (suspiciousFiles.length > 0) {
                console.log('🧹 Cleaning up suspicious file references from localStorage:', suspiciousFiles);
                // Remove currentPreviewFiles from stored state
                delete parsed.state.currentPreviewFiles;
                localStorage.setItem('preview-store', JSON.stringify(parsed));
                console.log('✅ Cleaned up localStorage preview-store data');
            }
        }
    }
} catch (error) {
    console.warn('Failed to clean up localStorage:', error);
}

export default usePreviewStore;