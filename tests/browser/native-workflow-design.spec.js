import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';
const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
let native, provider, endpoint;
const captured = [];
let source = `agent HousingWorkflow is Agent
  memory scope "housing_workflow" strict
    completed: Int = 0
  public
    ability analyze(comparison: Any, maximum: Float) -> Any effects(workflow, memory.read, memory.write)
      workflow "analysis" persist "analysis"
        state select_neighbors
          selection = []
          for query in comparison.rows
            selected = []
            for neighbor in query.neighbors
              if neighbor.distance_squared <= maximum
                selected.append(neighbor.row)
            selection.append({query_row: query.assignment.row, selected_rows: selected})
          -> summarize
        state summarize
          count = 0
          for query in selection
            count = count + query.selected_rows.len()
          memory.store("completed", memory.require("completed") + 1)
          return {reference_id: comparison.reference_id, query_data_id: comparison.query_data_id, selection: selection, selected_count: count, completed: memory.require("completed")}
`;
const selectionSource = source;
test.skip(!binary || !target, 'Set native Rust server and loopback target');
test.beforeEach(async () => {
  captured.length = 0;
  source = selectionSource;
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    captured.push(parsed);
    const properties = parsed.response_format.json_schema.schema.properties;
    const slots = Object.fromEntries(
      Object.entries(properties).map(([name, schema]) => [
        name,
        schema.type === 'array' ? [] : 'Local fixture',
      ])
    );
    slots.source = source;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          { finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(slots) } },
        ],
      })
    );
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${provider.address().port}/v1/chat/completions`;
  native = new NativeTestServer(binary, target);
  await native.start(endpoint);
});
test.afterEach(async () => {
  await native?.dispose();
  if (provider?.listening) await new Promise((resolve) => provider.close(resolve));
});
test('reviews source and recovers a completed native workflow after response loss and restart', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const panel = await openWorkflow(page);
  await panel.getByRole('button', { name: '生成工作流草稿', exact: true }).click();
  await expect(page.getByLabel('工作流源码', { exact: true })).toHaveText(source);
  const execute = panel.getByRole('button', { name: '执行已审阅工作流', exact: true });
  await expect(execute).toBeDisabled();
  expect(captured).toHaveLength(1);
  const subjects = JSON.parse(captured[0].messages[1].content).subjects;
  const comparison = subjects.find((v) => v && typeof v === 'object' && v.reference_id && v.rows);
  const maximum = subjects.find((v) => typeof v === 'number');
  expect(comparison.rows).toHaveLength(2);
  const expected = comparison.rows.map((q) => ({
    query_row: q.assignment.row,
    selected_rows: q.neighbors.filter((n) => n.distance_squared <= maximum).map((n) => n.row),
  }));
  let completed;
  await page.route('**/workflow/execute', async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    completed = await response.json();
    await route.abort('failed');
  });
  await panel.getByRole('checkbox').check();
  await execute.click();
  await expect(panel.getByRole('alert')).toBeVisible();
  expect(completed.result.execution.value.selection).toEqual(expected);
  expect(completed.result.execution.value.selected_count).toBe(
    expected.reduce((n, q) => n + q.selected_rows.length, 0)
  );
  expect(completed.result.execution.value.completed).toBe(1);
  await page.unroute('**/workflow/execute');
  await native.stop();
  await new Promise((resolve) => provider.close(resolve));
  await native.start(endpoint);
  await page.reload();
  await expect(page.getByRole('heading', { name: '房屋特征研究', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(panel.getByRole('button', { name: '恢复原工作流操作', exact: true })).toBeVisible();
  const recovering = page.waitForResponse((r) => r.url().endsWith('/workflow/execute') && r.ok());
  await panel.getByRole('button', { name: '恢复原工作流操作', exact: true }).click();
  expect(await (await recovering).json()).toEqual(completed);
  await expect(page.getByLabel('工作流执行结果', { exact: true })).toContainText('"completed": 1');
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(panel).toContainText('当前服务未启用模型');
  await page.route('**/workflow/assess', async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await panel.getByRole('button', { name: '验收房屋筛选结果', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByLabel('工作流数值验收')).toHaveCount(0);
  await page.unroute('**/workflow/assess');
  await panel.getByRole('button', { name: '验收房屋筛选结果', exact: true }).click();
  await expect(panel.getByLabel('工作流数值验收')).toContainText(
    '本次房屋筛选结果与原生测量匹配。'
  );
  await expect(page.getByLabel('工作流执行结果', { exact: true })).toContainText('"completed": 1');
  let publication, publicationIntent;
  await page.route('**/workflow/publish', async (route) => {
    publicationIntent = route.request().postDataJSON();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    publication = await response.json();
    await route.abort('failed');
  });
  await panel.getByRole('button', { name: '保存本次验收为 FoKn 实例证据', exact: true }).click();
  await expect(panel.getByRole('button', { name: '恢复原证据发布', exact: true })).toBeEnabled();
  await expect(
    panel.getByRole('button', { name: '清除本地记录，准备新草稿', exact: true })
  ).toBeDisabled();
  await page.unroute('**/workflow/publish');
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  const publicationRecovery = page.waitForResponse(
    (r) => r.url().endsWith('/workflow/publish') && r.ok()
  );
  await panel.getByRole('button', { name: '恢复原证据发布', exact: true }).click();
  const published = await publicationRecovery;
  expect(published.request().postDataJSON()).toEqual(publicationIntent);
  expect(await published.json()).toEqual(publication);
  await expect(panel.getByLabel('已保存的工作流证据')).toContainText(
    '已保存：本次结果符合数值契约。'
  );
  await panel.getByRole('button', { name: '刷新当前证据状态', exact: true }).click();
  await expect(panel.getByLabel('当前工作流证据状态')).toContainText('当前查询：支持本次实例。');
  await native.stop();
  await native.start(endpoint);
  // A distinct native execution/publication changes the shared assessment dependency.
  const secondInput = structuredClone(publicationIntent.assessment.execution);
  secondInput.context.invocation = 'browser-second-execution';
  const second = await page.request.post(published.url().replace('/publish', '/execute'), {
    data: secondInput,
  });
  expect(second.ok()).toBe(true);
  expect((await second.json()).result.execution.value.completed).toBe(2);
  const nextPublication = await page.request.post(published.url(), {
    data: { assessment: { execution: secondInput }, invocation: 'browser-second-publication' },
  });
  expect(nextPublication.ok()).toBe(true);
  await panel.getByRole('button', { name: '刷新当前证据状态', exact: true }).click();
  await expect(panel.getByLabel('当前工作流证据状态')).toContainText('证据已过期');
  await expect(panel.getByLabel('已保存的工作流证据')).toContainText(
    '已保存：本次结果符合数值契约。'
  );
  await page.route('**/workflow/evidence', (route) => route.abort('failed'));
  await panel.getByRole('button', { name: '刷新当前证据状态', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByLabel('当前工作流证据状态')).toContainText('尚未读取当前状态');
  await page.unroute('**/workflow/evidence');
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(panel.getByLabel('当前工作流证据状态')).toContainText('尚未读取当前状态');
  await panel.getByRole('button', { name: '刷新当前证据状态', exact: true }).click();
  await expect(panel.getByLabel('当前工作流证据状态')).toContainText('证据已过期');
  await expect(page.getByLabel('工作流执行结果', { exact: true })).toContainText('"completed": 1');
  expect(publication.publication.assessment.observed.completed).toBe(1);
  expect(captured).toHaveLength(1);
  expect(errors).toEqual([]);
});

async function openWorkflow(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await expect(page.getByRole('heading', { name: '房屋特征研究', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await page.getByLabel('新样本 CSV', { exact: true }).fill('area,rooms\n40,2\n180,7\n');
  const panel = page.getByLabel('生成原生工作流', { exact: true });
  return panel;
}

test('continues a suspended native child and recovers the same continuation after restart', async ({
  page,
}) => {
  test.setTimeout(90000);
  source = `agent HousingWorkflow is Agent
  memory scope "gated_housing" strict
    started: Int = 0
    completed: Int = 0
  public
    ability analyze(comparison: Any, maximum: Float) -> Any effects(workflow, memory.read, memory.write)
      workflow "gated" persist "gated"
        state prepare
          memory.store("started", memory.require("started") + 1)
          -> review
        state review
          wait until memory.require("started") >= 2
          memory.store("completed", memory.require("completed") + 1)
          return {started: memory.require("started"), completed: memory.require("completed"), reference_id: comparison.reference_id}
`;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const panel = await openWorkflow(page);
  await panel.getByRole('button', { name: '生成工作流草稿', exact: true }).click();
  await expect(page.getByLabel('工作流源码', { exact: true })).toHaveText(source);
  await panel.getByRole('checkbox').check();
  const request = page.waitForRequest((r) => r.url().endsWith('/workflow/execute'));
  await panel.getByRole('button', { name: '执行已审阅工作流', exact: true }).click();
  const originalRequest = await request;
  const original = originalRequest.postDataJSON();
  await expect(panel.getByRole('button', { name: '继续挂起工作流', exact: true })).toBeVisible();
  const waitingResponse = page.waitForResponse(
    (r) => r.url().endsWith('/workflow/resume') && r.ok()
  );
  await panel.getByRole('button', { name: '继续挂起工作流', exact: true }).click();
  const waiting = await (await waitingResponse).json();
  expect(waiting.result.execution.status).toBe('suspended');
  await expect(panel.getByRole('button', { name: '继续挂起工作流', exact: true })).toBeEnabled();
  // A distinct native call opens this fixture's shared gate; it is not a UI bypass.
  const release = structuredClone(original);
  release.context.invocation = 'fixture-release';
  const opened = await page.evaluate(
    async ({ url, body }) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    { url: originalRequest.url(), body: release }
  );
  expect(opened.result.execution.value.completed).toBe(1);
  let completed, intent;
  await page.route('**/workflow/resume', async (route) => {
    intent = route.request().postDataJSON();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    completed = await response.json();
    await route.abort('failed');
  });
  await panel.getByRole('button', { name: '继续挂起工作流', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  expect(completed.result.execution.value).toMatchObject({ started: 2, completed: 2 });
  expect(intent.execution_invocation).toBe(original.context.invocation);
  expect(intent.execution.context.invocation).not.toBe(waiting.invocation);
  await page.unroute('**/workflow/resume');
  await native.stop();
  await new Promise((resolve) => provider.close(resolve));
  await native.start(endpoint);
  await page.reload();
  await expect(page.getByRole('heading', { name: '房屋特征研究', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  const recovering = page.waitForResponse((r) => r.url().endsWith('/workflow/resume') && r.ok());
  await panel.getByRole('button', { name: '恢复原工作流操作', exact: true }).click();
  const recovered = await recovering;
  expect(recovered.request().postDataJSON()).toEqual(intent);
  expect(await recovered.json()).toEqual(completed);
  await expect(page.getByLabel('工作流执行结果', { exact: true })).toContainText('"completed": 2');
  await expect(panel.getByRole('button', { name: '继续挂起工作流', exact: true })).toHaveCount(0);
  const assessmentResponse = page.waitForResponse(
    (r) => r.url().endsWith('/workflow/assess') && r.ok()
  );
  await panel.getByRole('button', { name: '验收房屋筛选结果', exact: true }).click();
  const assessed = await assessmentResponse;
  expect(assessed.request().postDataJSON().continuation_invocation).toBe(
    intent.execution.context.invocation
  );
  await expect(panel.getByLabel('工作流数值验收')).toContainText(
    '本次房屋筛选结果与原生测量不匹配。'
  );
  await expect(panel.getByLabel('工作流数值验收')).toContainText('差异字段');
  await panel.getByRole('button', { name: '保存本次验收为 FoKn 实例证据', exact: true }).click();
  await expect(panel.getByLabel('已保存的工作流证据')).toContainText(
    '已保存：本次结果反驳数值契约。'
  );
  expect(captured).toHaveLength(1);
  expect(errors).toEqual([]);
});
