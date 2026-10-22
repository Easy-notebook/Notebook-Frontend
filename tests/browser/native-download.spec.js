import { test, expect } from '@playwright/test';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { NativeTestServer } from './support/nativeServer.js';

const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
let native;
test.skip(!binary || !target, 'Set AAL_NATIVE_SERVER and loopback AAL_NOTEBOOK_TARGET');
test.beforeAll(async () => {
  native = new NativeTestServer(binary, target);
  await native.start();
});
test.afterAll(async () => {
  await native?.dispose();
});

test('downloads original historical CSV bytes after restart without running a study', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  const name = '房屋历史.csv';
  const original = Buffer.from('\uFEFFarea,rooms,note\r\n40,2,原始样本\r\n', 'utf8');
  const replacement = Buffer.from('area,rooms\n100,4\n');
  const input = page.getByLabel('参考数据 CSV 文件');
  const versions = page.getByRole('combobox', { name: '选择 CSV 文件版本' });
  await expect(input).toBeEnabled();
  await input.setInputFiles({ name, mimeType: 'text/csv', buffer: original });
  await expect(versions).toBeEnabled();
  const old = await versions.inputValue();
  expect(old).toMatch(/^[a-f0-9]{64}$/);
  await input.setInputFiles({ name, mimeType: 'text/csv', buffer: replacement });
  await expect(versions).not.toHaveValue(old);
  await expect(versions).toBeEnabled();
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '读取已保存 CSV', exact: true }).click();
  await expect(versions.locator('option')).toHaveCount(3);
  await versions.selectOption(old);
  await expect(page.getByRole('button', { name: '下载所选 CSV 原文件' })).toBeEnabled();
  // Editing current study input cannot change the selected immutable download.
  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n999,9\n');
  let mutations = 0;
  await page.route(/\/aal-api\/workspaces\/[^/]+\/(command|execute)$/, async (route) => {
    mutations += 1;
    await route.abort('failed');
  });
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载所选 CSV 原文件' }).click();
  const download = await saved;
  expect(download.suggestedFilename()).toBe(name);
  expect(await readFile(await download.path())).toEqual(original);
  await expect(page.getByText('原文件已交给浏览器下载。')).toBeVisible();
  expect(mutations).toBe(0);
});
