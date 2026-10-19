import { TabStateRecord } from './TabStateRecord';
import { ITabRepository, IStorageProvider } from '../interfaces';
import { TabStateEntity, type TabEntry, DB_STORES } from '../../../storage/schema';

export class TabRepository implements ITabRepository {
  constructor(private storage: IStorageProvider) {}

  async saveTabState(
    notebookId: string,
    tabList: readonly TabEntry[],
    activeTabId: string | null
  ): Promise<void> {
    const tabState = new TabStateRecord({
      notebookId,
      tabList,
      activeTabId,
      lastUpdated: Date.now(),
    }).toRecord();

    await this.storage.put(DB_STORES.TAB_STATES, tabState);
  }

  async getTabState(notebookId: string): Promise<TabStateEntity | null> {
    const state = await this.storage.get<unknown>(DB_STORES.TAB_STATES, notebookId);
    return state == null ? null : new TabStateRecord(state, notebookId).toRecord();
  }

  async deleteTabState(notebookId: string): Promise<void> {
    await this.storage.delete(DB_STORES.TAB_STATES, notebookId);
  }

  async getAllTabStates(): Promise<TabStateEntity[]> {
    const records = await this.storage.getAll<unknown>(DB_STORES.TAB_STATES);
    return records.map((record) => new TabStateRecord(record).toRecord());
  }
}
