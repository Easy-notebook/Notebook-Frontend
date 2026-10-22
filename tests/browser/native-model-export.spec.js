import { test, expect } from '@playwright/test';
import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NativeTestServer } from './support/nativeServer.js';
const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
const assign = process.env.AAL_NATIVE_ASSIGN;
let native;
test.skip(
  !binary || !target || !assign,
  'Set AAL_NATIVE_SERVER, AAL_NATIVE_ASSIGN and loopback AAL_NOTEBOOK_TARGET'
);
test.beforeAll(async () => {
  native = new NativeTestServer(binary, target);
  await native.start();
});
test.afterAll(async () => {
  await native?.dispose();
});
test('exports the complete native model after restart without refitting', async ({
  page,
}, testInfo) => {
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
  const query = testInfo.outputPath('new-houses.csv');
  await writeFile(query, 'rooms,area\n2,47\n4,113\n7,195\n');
  const { stdout } = await promisify(execFile)(assign, [
    await download.path(),
    query,
    testInfo.outputPath('offline-assignments'),
    'downloaded-model',
  ]);
  const assignments = JSON.parse(stdout);
  expect(assignments).toHaveLength(3);
  for (const [index, values] of [
    [47, 2],
    [113, 4],
    [195, 7],
  ].entries()) {
    const standardized = actual.features.map(
      (feature, i) => (values[i] - feature.mean) / feature.scale
    );
    const distances = actual.centers.map((center) =>
      center.reduce((sum, value, i) => sum + (standardized[i] - value) ** 2, 0)
    );
    expect(assignments[index].cluster).toBe(distances.indexOf(Math.min(...distances)));
    expect(assignments[index].distance_squared).toBeCloseTo(Math.min(...distances), 10);
  }

  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n999,2\n');
  await expect(button).toBeDisabled();
});
