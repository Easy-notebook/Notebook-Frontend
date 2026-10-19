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
