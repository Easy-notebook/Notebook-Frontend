import { test, expect } from '@playwright/test';
import process from 'node:process';
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
test('renders and downloads an actual Rust figure after restart and removes stale input views', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行房屋分群', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '执行房屋分群', exact: true }).click();
  const plot = page.getByRole('region', { name: '房屋分群图', exact: true });
  await expect(plot.getByRole('button', { name: '生成分群图' })).toBeEnabled();
  let result;
  page.on('response', async (response) => {
    if (response.url().endsWith('/figure') && response.ok()) result = await response.json();
  });
  await plot.getByRole('button', { name: '生成分群图' }).click();
  await expect(plot.getByRole('img')).toBeVisible();
  await expect.poll(() => result?.figure.points.length).toBe(12);
  expect(result.figure.points[0].x).toBe(40);
  expect(result.figure.points[0].y).toBe(2);
  expect(
    await plot.getByRole('img').evaluate((img) => img.complete && img.naturalWidth === 960)
  ).toBe(true);
  await plot.screenshot({ path: testInfo.outputPath('housing-figure.png') });
  const original = result;
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(plot.getByRole('button', { name: '生成分群图' })).toBeEnabled();
  let mutations = 0;
  await page.route(/\/aal-api\/workspaces\/[^/]+\/(command|execute)$/, async (route) => {
    mutations++;
    await route.abort('failed');
  });
  result = undefined;
  await plot.getByRole('button', { name: '生成分群图' }).click();
  await expect(plot.getByRole('img')).toBeVisible();
  await expect.poll(() => result).toEqual(original);
  const downloaded = page.waitForEvent('download');
  await plot.getByRole('link', { name: '下载分群 SVG' }).click();
  const download = await downloaded;
  expect(await readFile(await download.path(), 'utf8')).toBe(original.figure.svg);
  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n999,2\n');
  await expect(plot.getByRole('img')).toHaveCount(0);
  await expect(plot.getByRole('button', { name: '生成分群图' })).toBeDisabled();
  expect(mutations).toBe(0);
});
