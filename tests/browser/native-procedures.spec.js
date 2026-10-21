import { test, expect } from '@playwright/test';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';
const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
const csv =
  'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n';
let native;
test.skip(!binary || !target, 'Set AAL_NATIVE_SERVER and loopback AAL_NOTEBOOK_TARGET');
test.beforeAll(async () => {
  native = new NativeTestServer(binary, target);
  await native.start();
});
test.afterAll(async () => {
  await native?.dispose();
});
async function state(page) {
  return page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    return fetch(
      `/aal-api/workspaces/${encodeURIComponent(store.getState().notebookId)}/state`
    ).then((r) => r.json());
  });
}
async function reuseSelected(page) {
  const completed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/command') &&
      response.request().postDataJSON()?.ability === 'reuse_study_procedure'
  );
  const button = page.getByRole('button', { name: '用当前 CSV 复用所选技能', exact: true });
  await button.click();
  expect((await completed).ok()).toBe(true);
  await expect(button).toBeEnabled();
}
test('saves a measured housing skill, replays a lost response after restart and reuses it on new data', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page.getByLabel('参考 CSV 内容').fill(csv);
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行房屋分群', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '执行房屋分群', exact: true }).click();
  await expect(page.getByRole('button', { name: '比较并解释相似样本', exact: true })).toBeEnabled();
  await page.getByLabel('新样本 CSV').fill('area,rooms\n41,2\n182,7\n');
  await page.getByRole('button', { name: '比较并解释相似样本', exact: true }).click();
  await page.getByText('可复用研究技能（0）', { exact: true }).click();
  await expect(page.getByRole('button', { name: '保存当前研究技能', exact: true })).toBeEnabled();
  const original = await state(page);
  const commands = [];
  await page.route('**/aal-api/workspaces/*/command', async (route) => {
    const command = route.request().postDataJSON();
    if (command.ability !== 'save_study_procedure') return route.continue();
    commands.push(command);
    if (commands.length === 1) {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: '保存当前研究技能', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试原操作', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toHaveCount(0);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  const saved = await state(page);
  expect(saved.document.revision).toBe(original.document.revision + 1);
  expect(saved.study.procedures).toHaveLength(1);
  await page.getByText('可复用研究技能（1）', { exact: true }).click();
  await expect(page.getByLabel('已保存的研究技能')).toHaveValue('housing-comparison');
  await page.getByLabel('参考 CSV 内容').fill(csv.replace('40,2\n', '30,2\n'));
  await page.getByLabel('新样本 CSV').fill('area,rooms\n30,2\n');
  await page.getByLabel('分群数量', { exact: true }).fill('2'); // saved recipe still uses 3
  await reuseSelected(page);
  await expect
    .poll(async () => (await state(page)).document.revision)
    .toBe(saved.document.revision + 4);
  const reused = await state(page);
  expect(reused.document.revision).toBe(saved.document.revision + 4);
  expect(reused.study.result.report.clusters).toHaveLength(3);
  expect(reused.study.comparison.reference_id).not.toBe(original.study.comparison.reference_id);
  expect(reused.study.comparison.rows[0].neighbors[0].row).toBe(0);
  expect(reused.study.comparison.rows[0].neighbors[0].distance_squared).toBe(0);
  expect(reused.study.comparison.rows[0].neighbors[0].terms).toHaveLength(2);
  expect(reused.study.sample_evidence.current).toBe(true);
  expect(reused.study.sample_evidence.facts.every((fact) => fact.status === 'supported')).toBe(
    true
  );
  expect(reused.study.procedures).toEqual(saved.study.procedures);
  const other = await page.request.get('/aal-api/workspaces/independent-procedure-notebook/state');
  expect((await other.json()).study.procedures).toEqual([]);
});

test('learns through the native task, replays a lost completion and reuses the observed recipe', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page.getByLabel('参考 CSV 内容').fill(csv);
  await page.getByLabel('新样本 CSV').fill('area,rooms\n41,2\n182,7\n');
  await page.getByLabel('每行近邻数量').fill('2');
  const before = await state(page);
  const commands = [];
  await page.route('**/aal-api/workspaces/*/command', async (route) => {
    const command = route.request().postDataJSON();
    if (command.ability !== 'learn_study') return route.continue();
    commands.push(command);
    if (commands.length === 1) {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: '分群、比较并学习', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试原操作', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toHaveCount(0);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  const learned = await state(page);
  expect(learned.document.revision).toBe(before.document.revision + 4);
  expect(learned.study.observed_procedures).toHaveLength(1);
  const procedure = learned.study.observed_procedures[0];
  expect(procedure.origin).toBe('observed');
  expect(procedure.observations).toContain('Committed boundary calls: 5');
  expect(procedure.observations).not.toContain(csv);
  expect(learned.study.comparison.rows[0].neighbors[0].row).toBe(1);
  expect(learned.study.sample_evidence.current).toBe(true);
  await page.getByText('可复用研究技能（1）', { exact: true }).click();
  await expect(page.getByLabel('已保存的研究技能')).toHaveValue(`observed/${procedure.name}`);
  await page.getByText('查看已提交的执行记录', { exact: true }).click();
  await expect(page.getByText(/Committed boundary calls: 5/)).toBeVisible();
  await page.getByLabel('参考 CSV 内容').fill(csv.replace('40,2\n', '30,2\n'));
  await page.getByLabel('新样本 CSV').fill('area,rooms\n30,2\n');
  await page.getByLabel('分群数量', { exact: true }).fill('2');
  await reuseSelected(page);
  const reused = await state(page);
  expect(reused.document.revision).toBe(learned.document.revision + 4);
  expect(reused.study.result.report.clusters).toHaveLength(3);
  expect(reused.study.comparison.reference_id).not.toBe(learned.study.comparison.reference_id);
  expect(reused.study.comparison.rows[0].neighbors[0].row).toBe(0);
  expect(reused.study.comparison.rows[0].neighbors[0].distance_squared).toBe(0);
  expect(reused.study.comparison.rows[0].neighbors[0].terms).toHaveLength(2);
  expect(reused.study.sample_evidence.facts.every((fact) => fact.status === 'supported')).toBe(
    true
  );
  expect(reused.study.observed_procedures).toEqual(learned.study.observed_procedures);
  const other = await page.request.get('/aal-api/workspaces/independent-observed-notebook/state');
  expect((await other.json()).study.observed_procedures).toEqual([]);
});
