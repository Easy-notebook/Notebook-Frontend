import { test, expect } from '@playwright/test';
import process from 'node:process';
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

test('renders actual FoKn provenance after response loss/restart and expires it on new input', async ({
  page,
}) => {
  test.setTimeout(90000);
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
  await expect(page.getByRole('button', { name: '比较并解释相似样本', exact: true })).toBeEnabled();
  await page.getByLabel('新样本 CSV').fill('area,rooms\n41,2\n');
  await page.getByRole('button', { name: '比较并解释相似样本', exact: true }).click();
  await page.getByText(/查询样本 0 → 分群/).click();
  const requests = [];
  await page.route('**/aal-api/workspaces/*/command', async (route) => {
    const command = route.request().postDataJSON();
    if (command.ability !== 'explain_study_sample') return route.continue();
    requests.push(command);
    if (requests.length === 1) {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: '保存样本证据链', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试原操作', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const evidence = page.getByRole('region', { name: 'FoKn 样本证据', exact: true });
  await expect(evidence.getByText('证据对应当前研究')).toBeVisible();
  await expect(evidence.getByText('同群近邻推导（3）')).toBeVisible();
  const first = evidence
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: /^参考行 1 ·/ }) })
    .first();
  await first.locator('summary').first().click();
  await expect(first.getByText('近邻序号 0 · 标准化距离平方 0.00000')).toBeVisible();
  await expect(first.getByText(requests[0].invocation, { exact: true }).first()).toBeVisible();
  await expect(first.getByText('引用评估修订 1 · 当前修订 1')).toHaveCount(2);
  const actual = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const response = await fetch(
      `/aal-api/workspaces/${encodeURIComponent(store.getState().notebookId)}/state`
    );
    return (await response.json()).study.sample_evidence;
  });
  expect(JSON.parse(await evidence.locator('pre').textContent())).toEqual(actual);
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/aal-frontend-proof-current.png' });
  await page.getByLabel('数值特征（每行一个）').fill('area');
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(evidence.getByText(/历史证据已过期/)).toBeVisible();
  await expect(evidence.locator('summary').filter({ hasText: /参考行 .*已过期/ })).toHaveCount(3);
  await expect(evidence.locator('summary').filter({ hasText: /参考行 .*已支持/ })).toHaveCount(0);
  await evidence.getByText(/历史证据已过期/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/aal-frontend-proof-stale.png' });
});
