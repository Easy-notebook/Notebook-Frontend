import { ITabRepository, IStorageProvider } from '../interfaces';
import { TabStateEntity, DB_STORES } from '../../../storage/schema';

export class TabRepository implements ITabRepository {
  constructor(private storage: IStorageProvider) {}

  async saveTabState(
    notebookId: string,
    tabList: any[],
    activeTabId: string | null
  ): Promise<void> {
    const tabState: TabStateEntity = {
      notebookId,
      tabList: tabList.map((tab) => ({
        id: tab.id,
        path: tab.path,
        name: tab.name,
        type: tab.type,
      })),
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
