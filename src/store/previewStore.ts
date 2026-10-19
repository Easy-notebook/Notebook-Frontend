import { makeFileId, parseFileId } from '@Storage/fileIdentity';
// store/previewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PreviewRequestLifecycle } from '@Services/preview/PreviewRequestLifecycle';
import { formatPreviewContent } from '@Services/preview/formatPreviewContent';
import {
  fileFromCache,
  hasCachedContent,
  type CachedFileRecord,
} from '@Services/preview/fileFromCache';
import { HttpResponseError } from '@Services/notebook/HttpResponseError';
import { previewFileSource } from '@Services/preview/PreviewFileSource';
import { describeError } from '@Utils/errors';
import { tabManagerService } from '@Services/tab/TabManagerService';
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

      // Persistence success is independent of whether this view still owns the result.
      const mutateCache = async (
        operation: () => Promise<unknown>,
        reconcile: () => void,
        errorMessage: string
      ): Promise<boolean> => {
        const request = normalRequests.begin();
        set({ isLoading: true, error: null });
        try {
          await operation();
          if (normalRequests.isCurrent(request)) reconcile();
          if (normalRequests.settle(request, 'ready')) set({ isLoading: false });
          return true;
        } catch (error) {
          fileLog.error(errorMessage, { error });
          if (normalRequests.settle(request, 'failed')) {
            set({ isLoading: false, error: errorMessage });
          }
          return false;
        }
      };

      const activatePreviewFile = (request: symbol, file: FileObject): FileObject => {
        const { publish } = requestScope(request);
        const tabs = tabManagerService.addTab(get().currentPreviewFiles, {
          id: file.id,
          path: file.path,
          name: file.name,
          type: getFileType(file.path),
        });
        publish({
          activeFile: file,
          activePreviewMode: getActivePreviewMode(file.type as FileType),
          currentPreviewFiles: tabs,
          isLoading: false,
        });
        // publish verifies ownership after synchronous subscribers before persistence starts.
        void get()
          .saveTabState(file.notebookId)
          .catch((error) => {
            storeLog.error('Failed to save activated preview tab', { fileId: file.id, error });
          });
        return file;
      };

      const previewFile = async (
        request: symbol,
        notebookId: string,
        filePath: string,
        fileMetadata: FileMetadata = {} as FileMetadata,
        admittedCacheRecord?: CachedFileRecord | null
      ): Promise<FileObject | undefined> => {
        const { check, publish } = requestScope(request);
        check();
        publish({ isLoading: true, error: null });

        // Check if file exists in cache with optimized query
        const cachedFile =
          admittedCacheRecord === undefined
            ? await persistenceService.files.getFile(notebookId, filePath)
            : admittedCacheRecord;
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
          !hasCachedContent(cachedFile) ||
          (lastModifiedBackend && cachedFile.metadata.lastModified !== lastModifiedBackend);

        if (needsFetch) {
          try {
            const response = await previewFileSource.load(notebookId, filePath);
            check();

            const { type: fileType, content } = formatPreviewContent({
              notebookId,
              filePath,
              content: response.content || '',
              backendBaseUrl: window.Backend_BASE_URL,
            });

            const metadata = await persistenceService.files.saveFile({
              notebookId,
              filePath,
              fileName: file.name,
              content,
              fileType,
              lastModified: String(lastModifiedBackend || new Date().toISOString()),
              size: new Blob([content]).size,
            });
            check();
            return activatePreviewFile(request, fileFromCache({ metadata, content }));
          } catch (error) {
            check();
            const missing = error instanceof HttpResponseError && error.status === 404;
            const message = describeError(error);
            fileLog.error('File preview failed', { filePath, error });
            publish({
              isLoading: false,
              error: missing ? null : `Failed to load file: ${message}`,
            });
            return undefined;
          }
        } else {
          return activatePreviewFile(request, fileFromCache(cachedFile));
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
          if (hasCachedContent(cachedFile)) {
            fileLog.info('Found file in cache', { filePath });

            const cachedMetadata = cachedFile.metadata;
            // Set active preview mode based on file type
            const previewMode = getActivePreviewMode(cachedMetadata.fileType as FileType);

            const fileObject = fileFromCache(cachedFile);

            publish({
              activeFile: fileObject,
              activePreviewMode: previewMode,
            });
            return fileObject;
          }

          return (await previewFile(request, notebookId, filePath, undefined, cachedFile)) ?? null;
        } catch (error) {
          check();
          fileLog.error('Error loading file by ID', { error });
          publish({ error: `Failed to load file: ${describeError(error)}` });
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
          publish({ error: `Failed to restore notebook tabs: ${describeError(error)}` });
          return;
        }

        // Discover defaults only when persistence confirms no saved state exists.
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
            if (currentNotebookId) {
              void get()
                .saveTabState(currentNotebookId)
                .catch((error) => {
                  storeLog.error('Failed to persist closed tab', { fileId, error });
                });
            }
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

        // Delete a file from cache. A completed mutation must not steal a newer view.
        deleteFileFromCache: (notebookId: string, filePath: string): Promise<boolean> =>
          mutateCache(
            async () => {
              if (!(await persistenceService.files.deleteFile(notebookId, filePath))) {
                throw new Error('File deletion was not committed');
              }
            },
            () => {
              const fileId = makeFileId(notebookId, filePath);
              if (
                get().currentPreviewFiles.some((file) => file.id === fileId) ||
                get().activeFile?.id === fileId
              ) {
                get().closePreviewFile(fileId);
              }
            },
            'Failed to delete file from cache'
          ),

        clearCacheForNotebook: (notebookId: string): Promise<boolean> =>
          mutateCache(
            () => persistenceService.files.clearNotebook(notebookId),
            () => {
              const current = get();
              const belongsToNotebook = (fileId: string) => fileId.startsWith(`${notebookId}::`);
              set({
                currentPreviewFiles: current.currentPreviewFiles.filter(
                  (file) => !belongsToNotebook(file.id)
                ),
                dirtyMap: Object.fromEntries(
                  Object.entries(current.dirtyMap).filter(([id]) => !belongsToNotebook(id))
                ),
                ...(current.activeFile && belongsToNotebook(current.activeFile.id)
                  ? { activeFile: null, activePreviewMode: null, previewMode: 'notebook' as const }
                  : {}),
              });
            },
            'Failed to clear notebook cache'
          ),

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

        // Edits target the captured file; navigation only revokes UI publication.
        updateActiveFileContent: async (content: string): Promise<FileObject | null> => {
          const file = get().activeFile;
          if (!file || !hasNotebookId(file.notebookId)) return null;
          const request = normalRequests.begin();
          set({ isLoading: false });
          try {
            // Updating an existing record preserves its metadata and cannot recreate a deleted file.
            const saved = await persistenceService.files.updateFileContent(
              file.notebookId,
              file.path,
              content
            );
            if (!normalRequests.isCurrent(request)) return null;
            if (!saved) {
              normalRequests.settle(request, 'failed');
              return null;
            }
            // Read the committed record, including UTF-8 size and repository-assigned timestamps.
            const record = await persistenceService.files.getFile(file.notebookId, file.path);
            if (!normalRequests.isCurrent(request)) return null;
            if (!hasCachedContent(record)) {
              normalRequests.settle(request, 'failed');
              return null;
            }
            const updated = fileFromCache(record);
            normalRequests.settle(request, 'ready');
            set({ activeFile: updated });
            return updated;
          } catch (error) {
            normalRequests.settle(request, 'failed');
            throw error;
          }
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
              const response = await previewFileSource.load(notebookId, filePath);
              if (!splitRequests.isCurrent(request)) return undefined;

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
                size: new Blob([content]).size,
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
            throw error;
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

export default usePreviewStore;
