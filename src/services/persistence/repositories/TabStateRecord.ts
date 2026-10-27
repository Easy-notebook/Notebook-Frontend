import { makeFileId } from '../../../storage/fileIdentity';
import type { TabEntry, TabStateEntity } from '../../../storage/schema';

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/** Validated, detached tab-state records at both sides of the persistence boundary. */
export class TabStateRecord {
  private readonly record: TabStateEntity;

  constructor(value: unknown, expectedNotebookId?: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid tab state record');
    const data = value as Record<string, unknown>;
    if (!nonEmptyString(data.notebookId) || !Array.isArray(data.tabList))
      throw new Error('Invalid notebook identity or tab list');
    if (expectedNotebookId !== undefined && data.notebookId !== expectedNotebookId)
      throw new Error('Invalid tab state notebook identity');
    const notebookId = data.notebookId;
    const identities = new Set<string>();
    const tabList = Array.from(data.tabList, (value: unknown): TabEntry => {
      const tab = value && typeof value === 'object' ? (value as Partial<TabEntry>) : {};
      if (
        !nonEmptyString(tab.id) ||
        !nonEmptyString(tab.path) ||
        !nonEmptyString(tab.name) ||
        !nonEmptyString(tab.type) ||
        tab.id !== makeFileId(notebookId, tab.path) ||
        identities.has(tab.id)
      )
        throw new Error('Invalid tab entry: identity, path and unique membership are required');
      identities.add(tab.id);
      return { id: tab.id, path: tab.path, name: tab.name, type: tab.type };
    });
    const activeTabId = data.activeTabId;
    if (activeTabId !== null && (typeof activeTabId !== 'string' || !identities.has(activeTabId)))
      throw new Error('Invalid active tab: selection must belong to the saved list');
    if (
      typeof data.lastUpdated !== 'number' ||
      !Number.isSafeInteger(data.lastUpdated) ||
      data.lastUpdated < 0
    )
      throw new Error('Invalid tab state timestamp');
    this.record = { notebookId, tabList, activeTabId, lastUpdated: data.lastUpdated };
  }

  toRecord(): TabStateEntity {
    return { ...this.record, tabList: this.record.tabList.map((tab) => ({ ...tab })) };
  }
}
