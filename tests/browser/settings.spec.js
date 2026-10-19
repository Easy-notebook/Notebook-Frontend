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

test('version-zero settings migrate once without double-encrypting credentials', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  const result = await page.evaluate(async () => {
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
        version: 0,
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
  });
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
