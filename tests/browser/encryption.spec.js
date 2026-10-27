import { test, expect } from '@playwright/test';

test('concurrent first encryption retains one usable key across browser reload', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  const values = ['first test value', '中文🧪', 'third test value'];
  const ciphertexts = await page.evaluate(async (values) => {
    const { encrypt } = await import('/src/utils/encryption.ts');
    return Promise.all(values.map(encrypt));
  }, values);
  await page.reload();
  const decrypted = await page.evaluate(async (ciphertexts) => {
    const { decrypt } = await import('/src/utils/encryption.ts');
    return Promise.all(ciphertexts.map(decrypt));
  }, ciphertexts);
  expect(decrypted).toEqual(values);
});

test('two tabs serialize first key initialization and retain both ciphertexts after reload', async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await Promise.all([
    page.goto('/tests/browser/storage.html'),
    second.goto('/tests/browser/storage.html'),
  ]);
  // Hold the first generator open so the second tab must wait on the same origin lock.
  await page.evaluate(async () => {
    const { encrypt } = await import('/src/utils/encryption.ts');
    const original = crypto.subtle.generateKey.bind(crypto.subtle);
    crypto.subtle.generateKey = async (...args) => {
      window.generatorEntered = true;
      await new Promise((resolve) => {
        window.releaseGenerator = resolve;
      });
      return original(...args);
    };
    window.firstEncryption = encrypt('first tab');
  });
  await page.waitForFunction(() => window.generatorEntered === true);
  await second.evaluate(async () => {
    const { encrypt } = await import('/src/utils/encryption.ts');
    window.secondEncryption = encrypt('second tab');
  });
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const locks = await navigator.locks.query();
        return locks.pending.filter((lock) => lock.name === 'easy-notebook:encryption-key').length;
      })
    )
    .toBe(1);
  await page.evaluate(() => window.releaseGenerator());
  const ciphertexts = await Promise.all([
    page.evaluate(() => window.firstEncryption),
    second.evaluate(() => window.secondEncryption),
  ]);
  await Promise.all([page.reload(), second.reload()]);
  for (const tab of [page, second]) {
    const values = await tab.evaluate(async (ciphertexts) => {
      const { decrypt } = await import('/src/utils/encryption.ts');
      return Promise.all(ciphertexts.map(decrypt));
    }, ciphertexts);
    expect(values).toEqual(['first tab', 'second tab']);
  }
});
