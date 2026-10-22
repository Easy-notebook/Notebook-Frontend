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
  const lookups = [];
  await page.route('**/aal-api/workspaces/*/commands/lookup', async (route) => {
    lookups.push(route.request().postDataJSON());
    await route.continue();
  });
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
  expect(requests).toHaveLength(1);
  expect(lookups).toContainEqual(requests[0]);
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
  const knowledge = page.getByRole('region', { name: '研究知识上下文', exact: true });
  await knowledge.getByRole('button', { name: '查看研究知识', exact: true }).click();
  await expect(knowledge.getByText(/读取时修订 4.*NotebookWorkspace/)).toBeVisible();
  const observed = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const response = await fetch(
      `/aal-api/workspaces/${encodeURIComponent(store.getState().notebookId)}/knowledge`
    );
    if (!response.ok) throw new Error('Native knowledge read failed');
    return response.json();
  });
  const retained = JSON.parse(await knowledge.getByLabel('完整知识快照 JSON').textContent());
  expect(retained).toEqual(observed);
  const claims = Object.values(observed.context.learned).flatMap((trees) =>
    Object.values(trees).flat()
  );
  expect(claims.some((claim) => claim.source.invocation === requests[0].invocation)).toBe(true);
  expect(
    claims.filter((claim) => claim.atom?.relation === 'housing_same_segment_neighbor')
  ).toHaveLength(3);

  await knowledge.getByRole('button', { name: '生成可下载知识报告', exact: true }).click();
  await expect(knowledge.getByRole('button', { name: '下载知识报告 Markdown' })).toBeVisible();
  const report = await knowledge.getByLabel('知识报告 Markdown').textContent();
  expect(report).toContain('# Effective knowledge');
  for (const fact of actual.facts) {
    expect(report).toContain(JSON.stringify(fact.id));
    expect(report).toContain(JSON.stringify(fact.source.invocation));
  }
  const pendingDownload = page.waitForEvent('download');
  await knowledge.getByRole('button', { name: '下载知识报告 Markdown' }).click();
  const downloaded = await pendingDownload;
  expect(downloaded.suggestedFilename()).toBe('knowledge-revision-4.md');
  expect(await readFile(await downloaded.path(), 'utf8')).toBe(report);

  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/aal-frontend-proof-current.png' });
  await page.getByLabel('数值特征（每行一个）').fill('area');
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(evidence.getByText(/历史证据已过期/)).toBeVisible();
  await expect(knowledge.getByLabel('完整知识快照 JSON')).toHaveCount(0);
  await expect(knowledge.getByRole('button', { name: '下载知识报告 Markdown' })).toHaveCount(0);
  await knowledge.getByRole('button', { name: '查看研究知识', exact: true }).click();
  await expect(
    knowledge.getByText('当前没有纳入上下文的知识。历史证据仍可在研究结果中查看。')
  ).toBeVisible();
  const expired = JSON.parse(await knowledge.getByLabel('完整知识快照 JSON').textContent());
  expect(expired.revision).toBe(5);
  expect(expired.context.learned).toEqual({});
  await knowledge.getByRole('button', { name: '生成可下载知识报告', exact: true }).click();
  await expect(knowledge.getByText(/知识报告 · 修订 5/)).toBeVisible();
  const expiredReport = await knowledge.getByLabel('知识报告 Markdown').textContent();
  expect(expiredReport).not.toContain('##### supported');
  for (const fact of actual.facts) expect(expiredReport).not.toContain(JSON.stringify(fact.id));

  await expect(evidence.locator('summary').filter({ hasText: /参考行 .*已过期/ })).toHaveCount(3);
  await expect(evidence.locator('summary').filter({ hasText: /参考行 .*已支持/ })).toHaveCount(0);
  await evidence.getByText(/历史证据已过期/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/aal-frontend-proof-stale.png' });
});
