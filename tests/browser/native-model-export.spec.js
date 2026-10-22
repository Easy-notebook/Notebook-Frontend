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
test('exports the complete native model after restart without refitting', async ({ page }) => {
  test.setTimeout(60000);
  let model;
  page.on('response', async (response) => {
    if (response.url().includes('/aal-api/workspaces/') && response.ok()) {
      const data = await response.json().catch(() => null);
      if (data?.study?.result?.report?.model) model = data.study.result.report.model;
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await page.getByRole('button', { name: '执行房屋分群', exact: true }).click();
  await expect(page.getByRole('button', { name: '导出冻结分群模型', exact: true })).toBeEnabled();
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  const button = page.getByRole('button', { name: '导出冻结分群模型', exact: true });
  await expect(button).toBeEnabled();
  await expect.poll(() => model?.training_rows).toBe(12);
  const expected = model;
  await native.stop();
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('mining-model.json');
  const actual = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(actual).toEqual(expected);
  expect(actual.features[0].mean).toBeGreaterThan(0);
  expect(actual.features[0].scale).toBeGreaterThan(0);
  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n999,2\n');
  await expect(button).toBeDisabled();
});
