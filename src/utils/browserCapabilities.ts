export const canUseDOM = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export const getBrowserLocalStorage = (): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;

    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;

    return storage;
  } catch {
    return null;
  }
};

export const getBrowserIndexedDB = (): IDBFactory | null => {
  try {
    if (typeof window === 'undefined') return null;

    const db = window.indexedDB;
    if (!db || typeof db.open !== 'function') return null;

    return db;
  } catch {
    return null;
  }
};
