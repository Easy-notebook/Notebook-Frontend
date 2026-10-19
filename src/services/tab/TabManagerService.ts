import { persistenceService } from '@Services/persistence/instance';
import { PreviewFile, FileType } from '@Store/models';
import { storeLog } from '@Utils/logger';
import { FileService } from '@Services/notebook/FileService';
import { TabCatalog } from './TabCatalog';
import { TabDiscoveryError, type TabDiscoveryFailure } from './TabDiscoveryError';

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

      return this.scopeState(
        notebookId,
        tabState.tabList.map((tab) => ({ ...tab, type: tab.type as FileType })),
        tabState.activeTabId
      );
    } catch (error) {
      storeLog.error('TabManagerService: Failed to load tabs', { notebookId, error });
      throw error;
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
      const { tabs: scopedTabs, activeTabId: scopedActiveTabId } = this.scopeState(
        notebookId,
        tabs,
        activeTabId
      );

      storeLog.debug('TabManagerService.saveTabs', {
        notebookId,
        totalTabs: tabs.length,
        scopedTabs: scopedTabs.length,
        activeTabId,
      });

      await persistenceService.tabs.saveTabState(notebookId, scopedTabs, scopedActiveTabId);
      storeLog.debug('TabManagerService: Saved tabs', { notebookId, count: scopedTabs.length });
    } catch (error) {
      storeLog.error('TabManagerService: Failed to save tabs', { notebookId, error });
      throw error;
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
    await this.saveTabs(notebookId, [], null);
  }

  private scopeState(notebookId: string, tabs: PreviewFile[], activeTabId: string | null) {
    const scopedTabs = tabs.filter((tab) => tab.id.startsWith(`${notebookId}::`));
    return {
      tabs: scopedTabs,
      activeTabId: scopedTabs.some((tab) => tab.id === activeTabId) ? activeTabId : null,
    };
  }

  /**
   * Load default tabs for a notebook (from storage and backend)
   * Used when no saved tab state exists
   */
  public async loadDefaultTabs(notebookId: string): Promise<PreviewFile[]> {
    const results = await Promise.allSettled([
      persistenceService.files
        .getFilesForNotebook(notebookId, false)
        .then((records) => TabCatalog.fromCache(notebookId, records)),
      FileService.listFiles(notebookId).then((response) =>
        TabCatalog.fromRemote(notebookId, response)
      ),
    ]);
    const byPath = new Map<string, PreviewFile>();
    const failures: TabDiscoveryFailure[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        failures.push({ source: index === 0 ? 'cache' : 'backend', cause: result.reason });
        storeLog.warn('Tab discovery source failed', {
          notebookId,
          source: index === 0 ? 'cache' : 'backend',
          error: result.reason,
        });
        continue;
      }
      // Cached metadata wins a duplicate path; source completion order cannot change this.
      for (const tab of result.value) if (!byPath.has(tab.path)) byPath.set(tab.path, tab);
    }
    if (failures.length && byPath.size === 0) {
      throw new TabDiscoveryError(failures);
    }
    return [...byPath.values()];
  }
}

export const tabManagerService = TabManagerService.getInstance();
