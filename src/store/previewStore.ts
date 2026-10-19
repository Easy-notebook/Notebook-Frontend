// store/previewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PreviewRequestLifecycle } from '@Services/preview/PreviewRequestLifecycle';
import { formatPreviewContent } from '@Services/preview/formatPreviewContent';
import type { FileContentResponse } from '@Services/types';
import { FileService } from '@Services/notebook/FileService';
import { fileLog, storeLog } from '@Utils/logger';
import { persistenceService } from '@Services/persistence/instance';
import { getFileType, getActivePreviewMode, getMimeType } from '@Storage/index';
import type {
  PreviewMode,
  FileObject,
  FileType,
  ActivePreviewMode,
  PreviewFile,
  FileMetadata,
} from '@Store/models';

// Backward-compat re-exports for consumers importing from previewStore
export type {
  FileType,
  ActivePreviewMode,
  FileObject,
  PreviewFile,
  PreviewMode,
  FileApiResponse,
} from '@Store/models';

// Types moved to @Store/models/preview

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
  clearError: () => void;
  setCurrentPreviewFiles: (files: PreviewFile[]) => void;
  setActiveFile: (file: FileObject | null) => void;
  setActivePreviewMode: (mode: ActivePreviewMode) => void;
  getCurrentPreviewFiles: () => PreviewFile[];
  previewFile: (
    notebookId: string,
    filePath: string,
    fileMetadata?: FileMetadata
  ) => Promise<FileObject | undefined>;
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
  previewFileInSplit: (
    notebookId: string,
    filePath: string,
    fileMetadata?: FileMetadata
  ) => Promise<FileObject | undefined>;
  closeSplitPreview: () => void;
  getActiveSplitFile: () => FileObject | null;

  // Tab state persistence
  saveTabState: (notebookId?: string) => Promise<void>;
  loadTabState: (notebookId: string) => Promise<void>;

  // Clear all notebook state
  clearNotebookState: () => void;
}

/**
 * 完整的 Preview Store 类型
 */
export type PreviewStore = PreviewStoreState & PreviewStoreActions;

// --- NotebookId-first small helpers (local, decoupled) ---
const FILE_ID_SEP = '::';
const makeFileId = (notebookId: string, filePath: string) =>
  `${notebookId}${FILE_ID_SEP}${filePath}`;
const parseFileId = (fileId: string): { notebookId: string; filePath: string } | null => {
  const idx = fileId.indexOf(FILE_ID_SEP);
  if (idx === -1) return null;
  const notebookId = fileId.slice(0, idx);
  const filePath = fileId.slice(idx + FILE_ID_SEP.length).trim();
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
    (set, get) => {
      const splitRequests = new PreviewRequestLifecycle();
      const resetSplit = () => {
        splitRequests.cancel();
        return { activeSplitFile: null, activeSplitMode: null, isSplitLoading: false };
      };

      const normalRequests = new PreviewRequestLifecycle();
      const obsoleteRequest = Symbol('obsolete-preview-request');
      const assertCurrent = (request: symbol) => {
        if (!normalRequests.isCurrent(request)) throw obsoleteRequest;
      };
      const runPreviewRequest = async <T>(
        work: (request: symbol) => Promise<T>
      ): Promise<T | undefined> => {
        const request = normalRequests.begin();
        set({ isLoading: true, error: null });
        try {
          assertCurrent(request);
          const result = await work(request);
          if (!normalRequests.settle(request, 'ready')) return undefined;
          set({ isLoading: false });
          return result;
        } catch (error) {
          if (!normalRequests.settle(request, 'failed')) return undefined;
          set({ isLoading: false });
          throw error;
        }
      };
      const cancelNormalPreview = () => {
        normalRequests.cancel();
      };

      const requestScope = (request: symbol) => ({
        check: () => assertCurrent(request),
        publish: (update: Partial<PreviewStoreState>) => {
          assertCurrent(request);
          set(update);
          // Subscribers may synchronously admit a replacement request.
          assertCurrent(request);
        },
      });

      const previewFile = async (
        request: symbol,
        notebookId: string,
        filePath: string,
        fileMetadata: FileMetadata = {} as FileMetadata
      ): Promise<FileObject | undefined> => {
        const { check, publish } = requestScope(request);
        check();
        publish({ isLoading: true, error: null });

        // Generate a unique ID for the file
        const fileId = makeFileId(notebookId, filePath);

        // Check if file exists in cache with optimized query
        const cachedFile = await persistenceService.files.getFile(notebookId, filePath);
        check();
        const lastModifiedBackend = fileMetadata.lastModified || null;
        let file = fileMetadata.file;
        if (!file) {
          // Create a safe placeholder File when not provided (derive name from path)
          let baseName = '';
          let mime = '';
          try {
            baseName = filePath.split('/').pop() || filePath;
            mime = getMimeType(filePath);
            file = new File([''], baseName, { type: mime, lastModified: Date.now() });
          } catch (e) {
            check();
            fileLog.warn('Failed to create placeholder File', { error: e, baseName, mime });
          }
        }
        if (!file) {
          publish({ error: 'File not found', isLoading: false });
          return;
        }

        // Determine if we need to fetch from backend
        const needsFetch =
          !cachedFile ||
          (lastModifiedBackend && cachedFile.metadata.lastModified !== lastModifiedBackend);

        if (needsFetch) {
          try {
            // Try multiple path variations for better compatibility
            let response: FileContentResponse | null = null;
            const pathsToTry = [
              filePath,
              `assets / ${filePath} `,
              filePath.split('/').pop() || filePath, // Just filename
            ];

            for (const pathToTry of pathsToTry) {
              try {
                response = await FileService.getFile(notebookId, pathToTry);
                check();
                if (response && response.status !== 'error') {
                  fileLog.debug('File found at path', {
                    originalPath: filePath,
                    resolvedPath: pathToTry,
                  });
                  break;
                }
              } catch {
                check();
                continue; // Try next path
              }
            }

            // If no path worked, throw the original error
            // Get file from backend
            if (!response) {
              response = await FileService.getFile(notebookId, filePath);
              check();
            }

            if (!response || response.status === 'error') {
              throw new Error(response?.message || 'Failed to fetch file for split preview');
            }

            const { type: fileType, content } = formatPreviewContent({
              notebookId,
              filePath,
              content: response.content || '',
              backendBaseUrl: window.Backend_BASE_URL,
            });

            // Create file object data for cache
            const fileObjectData = {
              id: fileId,
              notebookId,
              path: filePath,
              name: file.name,
              content,
              type: fileType,
              lastModified: String(lastModifiedBackend || new Date().toISOString()),
              size: content.length || 0,
            };

            // Save to optimized IndexedDB
            await persistenceService.files.saveFile({
              notebookId: fileObjectData.notebookId,
              filePath: fileObjectData.path,
              fileName: fileObjectData.name,
              content: fileObjectData.content,
              fileType: fileObjectData.type,
              lastModified: fileObjectData.lastModified,
              size: fileObjectData.size,
            });
            check();

            // Create full file object for state
            const fileObject: FileObject = {
              ...fileObjectData,
              cachedAt: Date.now(),
              accessCount: 1,
              lastAccessed: Date.now(),
            };

            // Set as active file and renderer mode
            const activeMode = getActivePreviewMode(fileType);
            publish({
              activeFile: fileObject,
              activePreviewMode: activeMode,
              isLoading: false,
            });

            // Update current preview files list - better management
            const { currentPreviewFiles } = get();
            const existingFileIndex = currentPreviewFiles.findIndex((f) => f.id === fileId);

            let updatedFiles: PreviewFile[];
            if (existingFileIndex >= 0) {
              // Update existing file in the list
              updatedFiles = [...currentPreviewFiles];
              updatedFiles[existingFileIndex] = {
                id: fileId,
                path: filePath,
                name: file.name,
                type: fileType,
              };
            } else {
              // Add new file to the list
              updatedFiles = [
                ...currentPreviewFiles,
                {
                  id: fileId,
                  path: filePath,
                  name: file.name,
                  type: fileType,
                },
              ];
            }

            publish({ currentPreviewFiles: updatedFiles });

            // Save updated tab state to storage
            get()
              .saveTabState(notebookId)
              .catch((error) => {
                storeLog.error('Failed to save tab state after adding new file', {
                  error,
                  notebookId,
                  filePath,
                });
              });

            return fileObject;
          } catch (e: any) {
            check();
            const msg = e && e.message ? String(e.message) : '';
            fileLog.error('File fetch error', { message: msg, filePath });

            const isNotFound = /not\s*found/i.test(msg) || /404/.test(msg);

            // If it's a 404 error, don't create tabs for missing files
            if (isNotFound) {
              fileLog.warn('File not found - will not create tab', { filePath });
              publish({ isLoading: false, error: null }); // Clear error, don't show to user
              return undefined; // Return undefined instead of throwing
            }

            // For non-404 errors, try fallbacks
            const baseName = filePath.split('/').pop() || filePath;

            if (baseName !== filePath) {
              fileLog.info('Trying fallback to basename', {
                original: filePath,
                fallback: baseName,
              });
              try {
                return await previewFile(request, notebookId, baseName, fileMetadata);
              } catch (fallbackError) {
                check();
                fileLog.warn('Basename fallback failed', { error: fallbackError, baseName });
              }
            }

            // Try URL encoding the file path
            if (filePath.includes(' ')) {
              fileLog.info('Trying URL encoded path', { filePath });
              const encodedPath = filePath
                .split('/')
                .map((part) => encodeURIComponent(part))
                .join('/');
              if (encodedPath !== filePath) {
                try {
                  return await previewFile(request, notebookId, encodedPath, fileMetadata);
                } catch (encodingError) {
                  check();
                  fileLog.warn('URL encoding fallback failed', {
                    error: encodingError,
                    encodedPath,
                  });
                }
              }
            }

            // All fallbacks failed, don't create a tab
            publish({ isLoading: false, error: null }); // Clear error, don't show to user
            fileLog.warn('All file load attempts failed - no tab will be created', { filePath });
            return undefined; // Return undefined instead of throwing
          }
        } else {
          // File found in cache
          // File found in cache
          const cachedMetadata = cachedFile.metadata;
          const cachedMode = getActivePreviewMode(cachedMetadata.fileType as FileType);

          const fileObject: FileObject = {
            id: cachedMetadata.id,
            notebookId: cachedMetadata.notebookId,
            path: cachedMetadata.filePath,
            name: cachedMetadata.fileName,
            content: cachedFile.content || '',
            type: cachedMetadata.fileType,
            lastModified: cachedMetadata.lastModified,
            size: cachedMetadata.size,
            cachedAt: cachedMetadata.cachedAt,
            accessCount: cachedMetadata.accessCount,
            lastAccessed: cachedMetadata.lastAccessedAt,
          };

          publish({
            activeFile: fileObject,
            activePreviewMode: cachedMode,
            isLoading: false,
          });

          // Update current preview files list - better management for cached files
          const { currentPreviewFiles } = get();
          const existingFileIndex = currentPreviewFiles.findIndex((f) => f.id === fileId);

          let updatedFiles: PreviewFile[];
          if (existingFileIndex >= 0) {
            // Update existing file in the list
            updatedFiles = [...currentPreviewFiles];
            updatedFiles[existingFileIndex] = {
              id: fileId,
              path: filePath,
              name: file.name,
              type: getFileType(filePath),
            };
          } else {
            // Add new file to the list
            updatedFiles = [
              ...currentPreviewFiles,
              {
                id: fileId,
                path: filePath,
                name: file.name,
                type: getFileType(filePath),
              },
            ];
          }

          publish({ currentPreviewFiles: updatedFiles });

          // Save updated tab state to storage
          get()
            .saveTabState(notebookId)
            .catch((error) => {
              storeLog.error('Failed to save tab state after loading cached file', {
                error,
                notebookId,
                filePath,
              });
            });

          return fileObject;
        }
      };
      const loadFileById = async (request: symbol, fileId: string): Promise<FileObject | null> => {
        const { check, publish } = requestScope(request);
        check();
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
          const cachedFile = await persistenceService.files.getFile(notebookId, filePath);
          check();
          if (cachedFile) {
            fileLog.info('Found file in cache', { filePath });

            const cachedMetadata = cachedFile.metadata;
            // Set active preview mode based on file type
            const previewMode = getActivePreviewMode(cachedMetadata.fileType as FileType);

            const fileObject: FileObject = {
              id: cachedMetadata.id,
              notebookId: cachedMetadata.notebookId,
              path: cachedMetadata.filePath,
              name: cachedMetadata.fileName,
              content: cachedFile.content || '',
              type: cachedMetadata.fileType,
              lastModified: cachedMetadata.lastModified,
              size: cachedMetadata.size,
              cachedAt: cachedMetadata.cachedAt,
              accessCount: cachedMetadata.accessCount,
              lastAccessed: cachedMetadata.lastAccessedAt,
            };

            publish({
              activeFile: fileObject,
              activePreviewMode: previewMode,
            });
            return fileObject;
          }

          // Try to fetch from server, but handle errors gracefully
          try {
            fileLog.info('Attempting to fetch file from server', { filePath });
            const fetched = await previewFile(request, notebookId, filePath);
            check();
            if (fetched) {
              fileLog.info('Successfully fetched and loaded file', { filePath });
              return fetched;
            } else {
              fileLog.warn('File fetch returned undefined', { filePath });
              return null;
            }
          } catch (e: any) {
            check();
            const msg = e?.message || String(e);
            const isNotFound = /not\s*found/i.test(msg) || /404/.test(msg);

            if (isNotFound) {
              fileLog.warn('File not found on server - this is normal for missing files', {
                filePath,
              });

              // Remove this tab from the preview files list since the file doesn't exist
              const { currentPreviewFiles } = get();
              const updatedFiles = currentPreviewFiles.filter((f) => f.id !== fileId);

              publish({
                currentPreviewFiles: updatedFiles,
                error: null, // Don't show error to user for missing files
              });

              return null;
            } else {
              fileLog.error('Error loading file', { filePath, error: e });
              return null;
            }
          }
        } catch (error) {
          check();
          fileLog.error('Error loading file by ID', { error });
          return null;
        }
      };
      const loadNotebookTabs = async (request: symbol, notebookId: string): Promise<void> => {
        const { check, publish } = requestScope(request);
        check();
        try {
          storeLog.info('Loading tabs for notebook', { notebookId });

          publish({ isLoading: true, error: null });

          // 🔍 Get current state to check if we're switching notebooks
          const currentState = get();
          const currentNotebookId = currentState.getCurrentNotebookId();
          if (currentNotebookId !== notebookId) get().closeSplitPreview();

          if (currentNotebookId && currentNotebookId !== notebookId) {
            storeLog.info('Switching notebooks', { from: currentNotebookId, to: notebookId });
            // Clear all tabs when switching notebooks
            publish({
              currentPreviewFiles: [],
              activeFile: null,
              activePreviewMode: null,
            });
            // Establish the new notebook context for this load
            publish({ currentNotebookId: notebookId });
          } else if (currentNotebookId === notebookId) {
            storeLog.info('Already on notebook - refreshing tabs', { notebookId });
          } else if (!currentNotebookId) {
            // No notebook context yet; set it now to ensure proper scoping
            publish({ currentNotebookId: notebookId });
          }

          // 📂 Delegate file loading to TabManagerService
          const { tabManagerService } = await import('@Services/tab/TabManagerService');
          check();
          const previewFiles = await tabManagerService.loadDefaultTabs(notebookId);
          check();

          storeLog.info('Processed valid preview files for tabs', { count: previewFiles.length });

          // 🎯 Only set tabs for current notebook (no auto-active file)
          // Request ownership also distinguishes consecutive loads of the same notebook.
          publish({
            currentPreviewFiles: previewFiles,
            activeFile: null, // Don't auto-activate any file
            activePreviewMode: null,
            isLoading: false,
          });

          storeLog.info('Loaded tabs for notebook (safe mode)', {
            count: previewFiles.length,
            notebookId,
          });
        } catch (error) {
          check();
          storeLog.error('Failed to load tabs for notebook', { notebookId, error });
          publish({
            error: `Failed to load notebook tabs: ${error}`,
            isLoading: false,
          });
        }
      };
      const switchToNotebook = async (request: symbol, notebookId: string): Promise<void> => {
        const { check, publish } = requestScope(request);
        check();
        get().closeSplitPreview();
        check();
        try {
          storeLog.info('Switching preview to notebook', { notebookId });

          // Save current notebook's tab state before switching
          const currentNotebookId = get().currentNotebookId;
          if (currentNotebookId && currentNotebookId !== notebookId) {
            await get().saveTabState(currentNotebookId);
            check();
          }

          // Set current notebook ID and switch to notebook mode
          // Clear tabs if switching to a different notebook to prevent stale tabs
          publish({
            ...resetSplit(),
            currentNotebookId: notebookId,
            previewMode: 'notebook', // 确保切换到notebook预览模式
            activeFile: null, // 清除活跃文件
            activePreviewMode: null,
            currentPreviewFiles: currentNotebookId !== notebookId ? [] : get().currentPreviewFiles,
          });

          // Load tabs from saved state or from scratch
          await loadTabState(request, notebookId);
          check();

          storeLog.info('Successfully switched preview to notebook', {
            notebookId,
            previewMode: 'notebook',
          });
        } catch (error) {
          check();
          storeLog.error('Failed to switch preview to notebook', { notebookId, error });
          publish({ error: `Failed to switch notebook: ${error}` });
        }
      };
      const loadTabState = async (request: symbol, notebookId: string): Promise<void> => {
        const { check, publish } = requestScope(request);
        check();
        if (get().currentNotebookId !== notebookId) get().closeSplitPreview();
        check();
        try {
          const { tabManagerService } = await import('@Services/tab/TabManagerService');
          check();
          const loadedState = await tabManagerService.loadTabs(notebookId);
          check();

          if (loadedState) {
            const { tabs, activeTabId } = loadedState;
            storeLog.info('Loading saved tab state for notebook', {
              notebookId,
              tabCount: tabs.length,
            });

            // Validate tabs (simplified validation for now, relying on service filtering)
            // In a full refactor, validation logic could also move to service or utility

            // Set tabs
            publish({
              ...(get().currentNotebookId !== notebookId
                ? {
                    ...resetSplit(),
                    activeFile: null,
                    activePreviewMode: null,
                    previewMode: 'notebook' as const,
                  }
                : {}),
              currentPreviewFiles: tabs,
              currentNotebookId: notebookId,
            });

            // Restore active tab
            if (activeTabId) {
              try {
                const activeFile = await loadFileById(request, activeTabId);
                check();
                if (activeFile) {
                  const activePreviewMode = getActivePreviewMode(activeFile.type as FileType);
                  publish({
                    activeFile,
                    activePreviewMode,
                    previewMode: 'file', // Force file mode when restoring active tab
                  });
                  storeLog.info('Active tab restored successfully', { activeTabId });
                }
              } catch (error) {
                check();
                storeLog.warn('Failed to restore active tab', { error, activeTabId });
              }
            }
            return;
          }

          storeLog.info('No saved tab state found - loading from scratch', { notebookId });
        } catch (error) {
          check();
          storeLog.error('Failed to load tab state', { error });
        }

        // Fallback to regular tab loading if no saved state or error
        await loadNotebookTabs(request, notebookId);
        check();
      };
      return {
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
          cancelNormalPreview();
          if (get().previewMode === 'notebook') {
            set({ previewMode: 'file', isLoading: false });
          } else {
            set({ previewMode: 'notebook', isLoading: false });
          }
        },

        resetToNotebookMode: () => {
          cancelNormalPreview();
          set({
            isLoading: false,
            ...resetSplit(),
            previewMode: 'notebook',
            activeFile: null,
            activePreviewMode: null,
            currentPreviewFiles: [],
          });
        },

        // Clear error
        clearError: () => set({ error: null }),

        // Set currently previewed files
        setCurrentPreviewFiles: (files: PreviewFile[]) => set({ currentPreviewFiles: files }),

        // Set active file
        setActiveFile: (file: FileObject | null) => {
          cancelNormalPreview();
          set({ activeFile: file, isLoading: false });
        },

        // Set active preview mode
        setActivePreviewMode: (mode: ActivePreviewMode) => set({ activePreviewMode: mode }),

        getCurrentPreviewFiles: () => get().currentPreviewFiles,

        // Fetch and preview a file
        previewFile: (notebookId, filePath, fileMetadata) =>
          runPreviewRequest((request) => previewFile(request, notebookId, filePath, fileMetadata)),

        getActiveFile: () => get().activeFile,

        // Close a preview file
        closePreviewFile: (fileId: string) => {
          void runPreviewRequest(async (request) => {
            const { check, publish } = requestScope(request);
            const { currentPreviewFiles, activeFile, dirtyMap, currentNotebookId } = get();
            const closedIndex = currentPreviewFiles.findIndex((file) => file.id === fileId);
            const updatedFiles = currentPreviewFiles.filter((file) => file.id !== fileId);
            const nextDirtyMap = { ...dirtyMap };
            delete nextDirtyMap[fileId];
            const closingActive = activeFile?.id === fileId;
            const candidates = currentNotebookId
              ? updatedFiles.filter((file) => file.id.startsWith(`${currentNotebookId}::`))
              : updatedFiles;
            const nextFile = closingActive
              ? candidates[Math.min(Math.max(0, closedIndex), candidates.length - 1)]
              : undefined;

            // Removal is immediate; selecting a neighbor is part of the same request.
            publish({
              currentPreviewFiles: updatedFiles,
              dirtyMap: nextDirtyMap,
              ...(closingActive
                ? {
                    activeFile: null,
                    activePreviewMode: null,
                    previewMode: nextFile ? 'file' : 'notebook',
                  }
                : {}),
            });
            // Capture the closed-tab snapshot before any asynchronous neighbor load.
            if (currentNotebookId) void get().saveTabState(currentNotebookId);
            if (nextFile) {
              await loadFileById(request, nextFile.id);
              check();
              if (currentNotebookId) await get().saveTabState(currentNotebookId);
            }
          }).catch((error) => storeLog.error('Failed to close preview file', { fileId, error }));
        },

        // Load a file by its ID
        loadFileById: async (fileId) =>
          (await runPreviewRequest((request) => loadFileById(request, fileId))) ?? null,

        // Delete a file from cache
        deleteFileFromCache: async (notebookId: string, filePath: string): Promise<boolean> => {
          try {
            await persistenceService.files.deleteFile(notebookId, filePath);

            // Update state if needed
            const fileId = makeFileId(notebookId, filePath);
            const { currentPreviewFiles } = get();

            // Remove from preview files list
            if (currentPreviewFiles.some((f) => f.id === fileId)) {
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
            // Note: persistenceService doesn't have clearNotebookCache exposed directly on files repo yet
            // But we can iterate and delete or add a method.
            // For now, let's assume we might need to add it or use getFilesForNotebook + delete
            const files = await persistenceService.files.getFilesForNotebook(notebookId);
            await Promise.all(
              files.map((f) => persistenceService.files.deleteFile(notebookId, f.metadata.filePath))
            );

            // Update state
            const { currentPreviewFiles } = get();
            const updatedFiles = currentPreviewFiles.filter(
              (f) => !f.id.startsWith(`${notebookId}::`)
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
                activePreviewMode: activePreviewMode,
              });
            } else {
              set({
                currentPreviewFiles: updatedFiles,
                activeFile: null,
                activePreviewMode: null,
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

          // Transform to match persistenceService expected format
          const cacheData = {
            notebookId: updated.notebookId,
            filePath: updated.path,
            fileName: updated.name,
            content: updated.content,
            lastModified: updated.lastModified,
            size: updated.size,
          };

          if (!hasNotebookId(updated.notebookId)) {
            set({ isLoading: false });
            return null;
          }

          await persistenceService.files.saveFile({
            notebookId: cacheData.notebookId,
            filePath: cacheData.filePath,
            fileName: cacheData.fileName,
            content: cacheData.content,
            // We don't have fileType in cacheData, but we can derive it or pass it if available in updated
            fileType: updated.type,
            lastModified: cacheData.lastModified,
            size: cacheData.size,
          });
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
        loadNotebookTabs: async (notebookId) => {
          await runPreviewRequest((request) => loadNotebookTabs(request, notebookId));
        },

        // Switch to a different notebook and load its tabs
        // Note: Notebook content loading is handled by NotebookSessionService.connect()
        // This function only manages preview/tab state
        switchToNotebook: async (notebookId) => {
          await runPreviewRequest((request) => switchToNotebook(request, notebookId));
        },

        // Get current notebook ID
        getCurrentNotebookId: (): string | null => {
          return get().currentNotebookId;
        },

        // Get tabs filtered by notebook ID
        getTabsByNotebook: (notebookId: string): PreviewFile[] => {
          const { currentPreviewFiles } = get();
          return currentPreviewFiles.filter((file) => file.id.startsWith(`${notebookId}::`));
        },

        // Split preview methods - independent from tab system
        previewFileInSplit: async (
          notebookId: string,
          filePath: string,
          fileMetadata: FileMetadata = {} as FileMetadata
        ): Promise<FileObject | undefined> => {
          const request = splitRequests.begin();
          set({ isSplitLoading: true, error: null });

          fileLog.info('Split preview: Loading file', { filePath, notebookId });

          try {
            if (!splitRequests.isCurrent(request)) return undefined;
            // Generate a unique ID for the file
            const fileId = makeFileId(notebookId, filePath);

            // Check if file exists in split preview cache (independent from tabs)
            const cachedFile = await persistenceService.splitFiles.getFile(notebookId, filePath);
            if (!splitRequests.isCurrent(request)) return undefined;
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
              if (splitRequests.settle(request, 'failed')) {
                set({ error: 'File not found for split preview', isSplitLoading: false });
              }
              return;
            }

            // Determine if we need to fetch from backend
            const needsFetch =
              !cachedFile ||
              (lastModifiedBackend && cachedFile.lastModified !== lastModifiedBackend);

            let fileObject: FileObject;

            if (needsFetch) {
              fileLog.info('Split preview: Fetching from backend', { filePath });

              // Get file from backend
              const response: FileContentResponse = await FileService.getFile(notebookId, filePath);

              if (!splitRequests.isCurrent(request)) return undefined;
              if (!response || response.status === 'error') {
                throw new Error(response?.message || 'Failed to fetch file for split preview');
              }

              const { type: fileType, content } = formatPreviewContent({
                notebookId,
                filePath,
                content: response.content || '',
                backendBaseUrl: window.Backend_BASE_URL,
              });

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
                lastAccessed: Date.now(),
              };

              // Cache the file for future use in split preview cache (independent from tabs)
              await persistenceService.splitFiles.saveFile(notebookId, filePath, {
                name: fileObject.name,
                content: fileObject.content,
                type: fileObject.type,
                size: fileObject.size,
                lastModified: fileObject.lastModified,
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
                lastAccessed: Date.now(),
              };
            }

            // Set split preview state
            const splitMode = getActivePreviewMode(fileObject.type as FileType);
            if (!splitRequests.settle(request, 'ready')) return undefined;
            set({
              activeSplitFile: fileObject,
              activeSplitMode: splitMode,
              isSplitLoading: false,
              error: null,
            });

            fileLog.info('Split preview loaded successfully', { filePath });
            return fileObject;
          } catch (error) {
            if (!splitRequests.settle(request, 'failed')) return undefined;
            fileLog.error('Split preview failed', { filePath, error });
            set({
              isSplitLoading: false,
              error: `Failed to load file in split preview: ${error}`,
              activeSplitFile: null,
              activeSplitMode: null,
            });
            return undefined;
          }
        },

        closeSplitPreview: () => {
          fileLog.info('Closing split preview');
          set({
            ...resetSplit(),
            error: null,
          });
        },

        getActiveSplitFile: (): FileObject | null => {
          return get().activeSplitFile;
        },

        // Save current tab state to storage
        saveTabState: async (notebookId?: string): Promise<void> => {
          const state = get();
          const targetNotebookId = notebookId || state.currentNotebookId;

          storeLog.debug('saveTabState called', {
            notebookId,
            currentNotebookId: state.currentNotebookId,
            targetNotebookId,
            tabCount: state.currentPreviewFiles.length,
          });

          if (!targetNotebookId) {
            storeLog.warn('No notebookId provided for saving tab state');
            return;
          }

          try {
            const { tabManagerService } = await import('@Services/tab/TabManagerService');
            const activeTabId = state.activeFile?.id?.startsWith(`${targetNotebookId}::`)
              ? state.activeFile.id
              : null;

            await tabManagerService.saveTabs(
              targetNotebookId,
              state.currentPreviewFiles,
              activeTabId
            );
          } catch (error) {
            storeLog.error('Failed to save tab state', { error });
          }
        },

        // Load tab state from storage
        loadTabState: async (notebookId) => {
          await runPreviewRequest((request) => loadTabState(request, notebookId));
        },

        // Clear all notebook state - used when creating a new notebook
        clearNotebookState: () => {
          cancelNormalPreview();
          storeLog.info('Clearing all notebook state from previewStore');
          set({
            isLoading: false,
            currentNotebookId: null,
            currentPreviewFiles: [],
            activeFile: null,
            activePreviewMode: null,
            dirtyMap: {},
            ...resetSplit(),
            previewMode: 'notebook',
            error: null,
          });
          storeLog.info('Cleared notebook state in previewStore');
        },
      };
    },
    {
      name: 'preview-store',
      version: 2, // Increment version to clear old persisted data
      partialize: (state) => ({
        // Only persist minimal state - route determines currentNotebookId
        dirtyMap: state.dirtyMap,
      }),
      // Merge function to ignore old persisted fields we no longer want
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PreviewStoreState> | undefined;
        return {
          ...currentState,
          // Only restore dirtyMap from persistence, ignore everything else
          dirtyMap: persisted?.dirtyMap || {},
        };
      },
    }
  )
);

// Clean up any stale localStorage data containing invalid file references
// This is a one-time cleanup for existing users
try {
  const storedData = localStorage.getItem('preview-store');
  if (storedData) {
    const parsed = JSON.parse(storedData);
    if (parsed?.state?.currentPreviewFiles) {
      // Check if there are any suspicious file references
      const suspiciousFiles = parsed.state.currentPreviewFiles.filter(
        (file: any) =>
          file.path &&
          (file.path.includes('sa_balance_exp.xlsx') ||
            file.path.includes('balance_exp') ||
            // Add other problematic patterns as needed
            (!file.path.includes('assets/') && file.path.match(/\.(xlsx?|csv|pdf)$/i)))
      );

      if (suspiciousFiles.length > 0) {
        storeLog.info('Cleaning up suspicious file references from localStorage', {
          count: suspiciousFiles.length,
          files: suspiciousFiles,
        });
        // Remove currentPreviewFiles from stored state
        delete parsed.state.currentPreviewFiles;
        localStorage.setItem('preview-store', JSON.stringify(parsed));
        storeLog.info('Cleaned up localStorage preview-store data');
      }
    }
  }
} catch (error) {
  storeLog.warn('Failed to clean up localStorage', { error });
}

export default usePreviewStore;
