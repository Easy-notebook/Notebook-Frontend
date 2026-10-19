import { test, expect } from '@playwright/test';

test('settings preserve plaintext runtime values and encrypted storage across reload and backup recovery', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  const before = await page.evaluate(async () => {
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    await store
      .getState()
      .updateApiSettings({ apiKey: 'settings-test-key', baseUrl: 'https://settings.example.test' });
    store.getState().updateLanguage('en');
    await store.persist.rehydrate();
    return {
      runtime: store.getState().settings,
      persisted: JSON.parse(localStorage.getItem('easy-notebook-settings')),
      backups: Object.keys(localStorage)
        .filter((key) => key.startsWith('easy-notebook-settings-backup-'))
        .map((key) => JSON.parse(localStorage.getItem(key))),
    };
  });
  expect(before.runtime).toMatchObject({ apiKey: 'settings-test-key', language: 'en' });
  expect(before.persisted.version).toBe(2);
  expect(before.persisted.state.settings.apiKey).not.toBe('settings-test-key');
  expect(before.backups.length).toBeGreaterThan(0);
  for (const backup of before.backups) expect(backup.apiKey).not.toBe('settings-test-key');
  await page.reload();
  const reloaded = await page.evaluate(async () => {
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    const settings = store.getState().settings;
    localStorage.removeItem('easy-notebook-settings');
    return settings;
  });
  expect(reloaded).toEqual(before.runtime);
  await page.reload();
  const restored = await page.evaluate(async () => {
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    return store.getState().settings;
  });
  expect(restored).toEqual(before.runtime);
});

for (const version of [0, undefined]) {
  test(`settings version ${version ?? 'missing'} migrates once without double-encrypting credentials`, async ({
    page,
  }) => {
    await page.goto('/tests/browser/storage.html');
    const result = await page.evaluate(async (version) => {
      const { encrypt, decrypt } = await import('/src/utils/encryption.ts');
      localStorage.setItem(
        'easy-notebook-settings',
        JSON.stringify({
          state: {
            settings: {
              apiKey: await encrypt('migration-test-key'),
              baseUrl: 'https://legacy.example.test',
              language: 'en',
            },
          },
          version,
        })
      );
      const { default: store } = await import('/src/store/settingsStore.ts');
      await store.persist.rehydrate();
      const saved = JSON.parse(localStorage.getItem('easy-notebook-settings'));
      return {
        runtime: store.getState().settings,
        version: saved.version,
        decoded: await decrypt(saved.state.settings.apiKey),
      };
    }, version);
    expect(result.runtime).toMatchObject({
      apiKey: 'migration-test-key',
      language: 'en',
      apiTimeout: 30000,
      theme: 'system',
      editorSettings: { editorType: 'tiptap' },
    });
    expect(result.version).toBe(2);
    expect(result.decoded).toBe('migration-test-key');
  });
}

test('future settings survive hydration and an attempted API settings update', async ({ page }) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
    const name = 'easy-notebook-settings';
    const future = JSON.stringify({ version: 3, state: { futureSchema: 'preserve' } });
    localStorage.setItem(name, future);
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    let error;
    try {
      await store.getState().updateApiSettings({ apiKey: 'new-test-key' });
    } catch (caught) {
      error = caught.name;
    }
    await store.persist.rehydrate();
    return {
      error,
      preserved: localStorage.getItem(name) === future,
      hydrated: store.persist.hasHydrated(),
      backups: Object.keys(localStorage).filter((key) => key.startsWith(`${name}-backup-`)),
    };
  });
  expect(result).toEqual({
    error: 'UnsupportedSettingsVersionError',
    preserved: true,
    hydrated: false,
    backups: [],
  });
});

test('backup recovery skips an unreadable newest ciphertext', async ({ page }) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
    const { encrypt } = await import('/src/utils/encryption.ts');
    const prefix = 'easy-notebook-settings-backup';
    const { initialSettings } = await import('/src/services/settings/SettingsDefaults.ts');
    localStorage.setItem(
      `${prefix}-1`,
      JSON.stringify({ ...initialSettings, apiKey: await encrypt('older-key'), language: 'en' })
    );
    localStorage.setItem(`${prefix}-2`, JSON.stringify({ apiKey: 'invalid-ciphertext' }));
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    return {
      key: store.getState().settings.apiKey,
      hydrated: store.persist.hasHydrated(),
      primary: localStorage.getItem('easy-notebook-settings'),
      newest: localStorage.getItem(`${prefix}-2`),
    };
  });
  expect(result.key).toBe('older-key');
  expect(result.hydrated).toBe(true);
  expect(result.primary).toBeNull();
  expect(JSON.parse(result.newest).apiKey).toBe('invalid-ciphertext');
});

test('transient controls do not write settings and void preference actions report persistence failures', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    store.getState().openSettings();
    store.getState().setError('temporary');
    store.getState().clearError();
    store.getState().closeSettings();
    await store.persist.rehydrate();
    const afterControls = Object.keys(localStorage);
    const originalSet = Storage.prototype.setItem;
    let attempts = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'easy-notebook-settings') {
        attempts++;
        throw new Error('test persistence failure');
      }
      return originalSet.call(this, key, value);
    };
    try {
      store.getState().updateLanguage('en');
      // Reads queue behind the write, then error reporting completes before hydration.
      await store.persist.rehydrate();
      return { afterControls, attempts, error: store.getState().error };
    } finally {
      Storage.prototype.setItem = originalSet;
    }
  });
  expect(result).toEqual({ afterControls: [], attempts: 1, error: 'test persistence failure' });
});

test('malformed current settings cannot hydrate or be introduced through runtime updates', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
    const { initialSettings } = await import('/src/services/settings/SettingsDefaults.ts');
    const raw = JSON.stringify({
      version: 2,
      state: { settings: { ...initialSettings, syncEnabled: 'false' } },
    });
    localStorage.setItem('easy-notebook-settings', raw);
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    const hydrated = store.persist.hasHydrated();
    let error;
    try {
      store.getState().batchUpdateSettings({ editorSettings: null });
    } catch (caught) {
      error = caught.message;
    }
    return {
      hydrated,
      error,
      runtime: store.getState().settings,
      preserved: localStorage.getItem('easy-notebook-settings') === raw,
    };
  });
  expect(result.hydrated).toBe(false);
  expect(result.error).toContain('settings.editorSettings');
  expect(result.runtime.editorSettings.editorType).toBe('tiptap');
  expect(result.preserved).toBe(true);
});

test('shortcut validation protects reserved bindings and permits existing Enter defaults', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
    const { default: store } = await import('/src/store/settingsStore.ts');
    await store.persist.rehydrate();
    let rejected;
    try {
      store.getState().updateShortcut('saveFile', 'Ctrl+C');
    } catch (error) {
      rejected = error.message;
    }
    const afterRejection = {
      binding: store.getState().settings.shortcuts.saveFile,
      primary: localStorage.getItem('easy-notebook-settings'),
    };
    store.getState().updateShortcut('newCell', 'Ctrl+Enter');
    await store.persist.rehydrate();
    return {
      rejected,
      afterRejection,
      binding: store.getState().settings.shortcuts.newCell,
      error: store.getState().error,
    };
  });
  expect(result.rejected).toContain('reserved by the system');
  expect(result.afterRejection).toEqual({ binding: 'Ctrl+S', primary: null });
  expect(result.binding).toBe('Ctrl+Enter');
  expect(result.error).toBeNull();
});

test('storage maintenance hook methods remain callable after destructuring', async ({ page }) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
    const { useStorageManager } = await import('/src/store/settingsStore.ts');
    const { checkStorage, getStorageEstimate } = useStorageManager();
    return { available: await checkStorage(), estimate: await getStorageEstimate() };
  });
  expect(result.available).toBe(true);
  expect(result.estimate.quota).toBeGreaterThan(result.estimate.usage);
});
