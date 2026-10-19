import { makeFileId } from '../../../storage/fileIdentity';
import { ITabRepository, IStorageProvider } from '../interfaces';
import { TabStateEntity, type TabEntry, DB_STORES } from '../../../storage/schema';

export class TabRepository implements ITabRepository {
  constructor(private storage: IStorageProvider) {}

  async saveTabState(
    notebookId: string,
    tabList: readonly TabEntry[],
    activeTabId: string | null
  ): Promise<void> {
    if (typeof notebookId !== 'string' || !notebookId || !Array.isArray(tabList)) {
      throw new Error('Invalid notebook identity or tab list');
    }
    const identities = new Set<string>();
    const entries = tabList.map((tab: TabEntry): TabEntry => {
      if (
        !tab ||
        [tab.id, tab.path, tab.name, tab.type].some(
          (value) => typeof value !== 'string' || !value
        ) ||
        tab.id !== makeFileId(notebookId, tab.path) ||
        identities.has(tab.id)
      ) {
        throw new Error('Invalid tab entry: identity, path and unique membership are required');
      }
      identities.add(tab.id);
      return { id: tab.id, path: tab.path, name: tab.name, type: tab.type };
    });
    if (activeTabId !== null && !identities.has(activeTabId)) {
      throw new Error('Invalid active tab: selection must belong to the saved list');
    }
    const tabState: TabStateEntity = {
      notebookId,
      tabList: entries,
      activeTabId,
      lastUpdated: Date.now(),
    };

    await this.storage.put(DB_STORES.TAB_STATES, tabState);
  }

  async getTabState(notebookId: string): Promise<TabStateEntity | null> {
    const state = await this.storage.get<TabStateEntity>(DB_STORES.TAB_STATES, notebookId);
    return state || null;
  }

  async deleteTabState(notebookId: string): Promise<void> {
    await this.storage.delete(DB_STORES.TAB_STATES, notebookId);
  }

  async getAllTabStates(): Promise<TabStateEntity[]> {
    return this.storage.getAll<TabStateEntity>(DB_STORES.TAB_STATES);
  }
}
