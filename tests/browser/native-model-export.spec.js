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
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let model;
  let referenceId;
  const referenceCsv =
    'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n';
  page.on('response', async (response) => {
    if (response.url().includes('/aal-api/workspaces/') && response.ok()) {
      const data = await response.json().catch(() => null);
      if (data?.study?.result?.report?.model) {
        model = data.study.result.report.model;
        referenceId = data.study.result.report.reference_id;
      }
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

  await native.start();
  await page.getByLabel('冻结分群模型文件').setInputFiles(await download.path());
  await page.getByLabel('导入模型的新样本 CSV').fill('rooms,area\n2,47\n4,113\n7,195\n');
  const assigned = page.waitForResponse(
    (response) => response.url().endsWith('/model-assignment') && response.ok()
  );
  await page.getByRole('button', { name: '使用导入模型分群', exact: true }).click();
  expect((await (await assigned).json()).assignments).toEqual(assignments);
  const imported = page.getByLabel('导入模型分群结果');
  await expect(imported.locator('summary')).toHaveCount(3);
  await imported.locator('summary').first().click();
  await expect(imported).toContainText('area：原值 47');
  await page.getByText('使用原始参考样本解释相似性', { exact: true }).click();
  await page.getByLabel('导入参考 CSV', { exact: true }).fill(referenceCsv);
  await page.getByLabel('原报告参考身份').fill(referenceId);
  const compared = page.waitForResponse(
    (response) => response.url().endsWith('/model-comparison') && response.ok()
  );
  await page.getByRole('button', { name: '比较导入参考样本', exact: true }).click();
  const comparison = (await (await compared).json()).comparison;
  expect(comparison.reference_id).toBe(referenceId);
  expect(comparison.rows).toHaveLength(3);
  expect(comparison.rows[0].neighbors[0].row).toBe(3);
  const referenceResult = page.getByLabel('导入参考比较结果');
  await expect(referenceResult.locator('summary')).toHaveCount(3);
  await referenceResult.locator('summary').first().click();
  await expect(referenceResult).toContainText('参考样本行 3');
  await expect(referenceResult.getByRole('button', { name: '保存样本证据链' })).toHaveCount(0);
  await page.getByLabel('原报告参考身份').fill('wrong-reference');
  await expect(referenceResult).toHaveCount(0);
  await page.getByRole('button', { name: '比较导入参考样本', exact: true }).click();
  await expect(page.getByLabel('导入参考相似比较').getByRole('alert')).toContainText(
    'reference identity changed'
  );
  await page.getByLabel('导入模型的新样本 CSV').fill('rooms,area\n2,49\n');
  await expect(imported).toHaveCount(0);
  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n999,2\n');
  await expect(button).toBeDisabled();
  expect(pageErrors).toEqual([]);
});
