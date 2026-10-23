import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';
const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
let native, provider, endpoint;
const captured = [];
const source = `agent HousingWorkflow is Agent
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
          return {selection: selection, selected_count: count, completed: memory.require("completed")}
`;
test.skip(!binary || !target, 'Set native Rust server and loopback target');
test.beforeAll(async () => {
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
test.afterAll(async () => {
  await native?.dispose();
  if (provider?.listening) await new Promise((resolve) => provider.close(resolve));
});
test('reviews source and recovers a completed native workflow after response loss and restart', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  expect(captured).toHaveLength(1);
  expect(errors).toEqual([]);
});
