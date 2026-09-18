import { persistenceService } from '@Services/persistence/instance';
import { PreviewFile, FileType } from '@Store/models';
import { storeLog } from '@Utils/logger';
import { FileORM, getFileType } from '@Storage/index';
import { FileService } from '@Services/notebook/FileService';
import { validateFileForTab } from '@Utils/fileValidation';

const makeFileId = (notebookId: string, filePath: string) => `${notebookId}::${filePath}`;

export class TabManagerService {
  private static instance: TabManagerService;

  private constructor() {}

  public static getInstance(): TabManagerService {
    if (!TabManagerService.instance) {
      TabManagerService.instance = new TabManagerService();
    }
    return TabManagerService.instance;
  }

  /**
   * Load tabs for a specific notebook from persistence
   */
  public async loadTabs(
    notebookId: string
  ): Promise<{ tabs: PreviewFile[]; activeTabId: string | null } | null> {
    try {
      const tabState = await persistenceService.tabs.getTabState(notebookId);
      if (!tabState) {
        return null;
      }

      // Filter tabs to ensure they belong to the current notebook
      const validTabs = tabState.tabList
        .filter((t) => t.id.startsWith(`${notebookId}::`))
        .map((t) => ({
          ...t,
          type: t.type as FileType,
        }));

      // Validate active tab ID
      let activeTabId = tabState.activeTabId;
      if (activeTabId && !activeTabId.startsWith(`${notebookId}::`)) {
        activeTabId = null;
      }

      return { tabs: validTabs, activeTabId };
    } catch (error) {
      storeLog.error('TabManagerService: Failed to load tabs', { notebookId, error });
      return null;
    }
  }

  /**
   * Save current tabs state for a notebook
   */
  public async saveTabs(
    notebookId: string,
    tabs: PreviewFile[],
    activeTabId: string | null
  ): Promise<void> {
    try {
      // Ensure we only save tabs for this notebook
      const scopedTabs = tabs.filter((t) => t.id.startsWith(`${notebookId}::`));

      storeLog.debug('TabManagerService.saveTabs', {
        notebookId,
        totalTabs: tabs.length,
        scopedTabs: scopedTabs.length,
        activeTabId,
      });

      await persistenceService.tabs.saveTabState(notebookId, scopedTabs, activeTabId);
      storeLog.debug('TabManagerService: Saved tabs', { notebookId, count: scopedTabs.length });
    } catch (error) {
      storeLog.error('TabManagerService: Failed to save tabs', { notebookId, error });
    }
  }

  /**
   * Add a tab to the list
   */
  public addTab(currentTabs: PreviewFile[], newTab: PreviewFile): PreviewFile[] {
    // Check if tab already exists
    const exists = currentTabs.some((t) => t.id === newTab.id);
    if (exists) {
      // Update existing tab info if needed, or just return current list
      return currentTabs.map((t) => (t.id === newTab.id ? newTab : t));
    }
    return [...currentTabs, newTab];
  }

  /**
   * Remove a tab from the list
   */
  public removeTab(currentTabs: PreviewFile[], tabIdToRemove: string): PreviewFile[] {
    return currentTabs.filter((t) => t.id !== tabIdToRemove);
  }

  /**
   * Clear all tabs for a notebook (persistence only)
   */
  public async clearTabs(notebookId: string): Promise<void> {
    try {
      await persistenceService.tabs.saveTabState(notebookId, [], null);
    } catch (error) {
      storeLog.error('TabManagerService: Failed to clear tabs', { notebookId, error });
    }
  }

  /**
   * Load default tabs for a notebook (from storage and backend)
   * Used when no saved tab state exists
   */
  public async loadDefaultTabs(notebookId: string): Promise<PreviewFile[]> {
    try {
      storeLog.info('TabManagerService: Loading default tabs', { notebookId });

      // 📂 Get files from storage (only for current notebook)
      let files: any[] = [];
      try {
        const fileResults = await FileORM.getFilesForNotebook(notebookId, false); // Don't load content for tabs

        // 🔍 Filter out notebook main files and invalid files
        const filteredResults = fileResults.filter((result) => {
          const filePath = result.metadata.filePath;
          const fileName = result.metadata.fileName;

          // Skip notebook main files (they shouldn't be tabs)
          if (filePath.startsWith('notebook_') && filePath.endsWith('.json')) {
            return false;
          }

          // Skip .easynb files (they are notebook files, not separate tabs)
          if (fileName.endsWith('.easynb')) {
            return false;
          }

          return true;
        });

        files = filteredResults.map((result) => ({
          id: makeFileId(notebookId, result.metadata.filePath),
          path: result.metadata.filePath,
          name: result.metadata.fileName,
          type: result.metadata.fileType,
          lastModified: result.metadata.lastModified,
          size: result.metadata.size,
          notebookId: result.metadata.notebookId,
          exists: true,
        }));

        storeLog.info('TabManagerService: Found valid files in storage', {
          validCount: files.length,
        });

        // 🔄 Also fetch files from backend for this notebook and merge
        try {
          const resp = await FileService.listFiles(notebookId);
          if (resp && (resp as any).status === 'ok' && Array.isArray((resp as any).files)) {
            const nodes = (resp as any).files as any[];
            const flatten = (arr: any[]): any[] =>
              arr.flatMap((n) =>
                n && n.type === 'directory' && Array.isArray(n.children) ? flatten(n.children) : [n]
              );
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
            backendFiles.forEach((x) => {
              if (!byPath.has(x.path)) byPath.set(x.path, x);
            });
            files = Array.from(byPath.values());
            storeLog.info('TabManagerService: Merged files from storage+backend', {
              count: files.length,
            });
          }
        } catch (e) {
          storeLog.warn('TabManagerService: Backend listFiles failed', { error: e });
        }
      } catch (storageError) {
        storeLog.warn('TabManagerService: Storage system failed', { error: storageError });
        files = [];
      }

      // 🏷️ Convert to PreviewFile format with additional validation
      const previewFiles: PreviewFile[] = files
        .filter((file) => {
          const validation = validateFileForTab(file.path || '', file.name || '', '');
          return validation.isValid;
        })
        .map((file) => ({
          id: file.id || makeFileId(notebookId, file.path),
          path: file.path,
          name: file.name,
          type: getFileType(file.path || file.name) as FileType,
        }));

      return previewFiles;
    } catch (error) {
      storeLog.error('TabManagerService: Failed to load default tabs', { notebookId, error });
      return [];
    }
  }
}

export const tabManagerService = TabManagerService.getInstance();
