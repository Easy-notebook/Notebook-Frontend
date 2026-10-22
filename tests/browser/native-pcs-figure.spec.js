import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { NativeTestServer } from './support/nativeServer.js';
const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
let native, provider, endpoint;
const captured = [];
const plan = {
  status: 'ready',
  mode: 'mining',
  title: 'Measured housing plot',
  summary: 'Compare and plot the reference',
  parameters: { columns: ['area', 'rooms'], clusters: 3 },
  steps: [{ agent: 'mining', objective: 'Discuss projection limits' }],
  actions: [{ kind: 'compare' }, { kind: 'visualize', x_feature: 'rooms', y_feature: 'area' }],
};
test.skip(!binary || !target, 'Set a web,model AAL_NATIVE_SERVER and loopback target');
test.beforeAll(async () => {
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    captured.push(payload);
    const slots = Object.fromEntries(
      Object.entries(payload.response_format.json_schema.schema.properties).map(
        ([name, schema]) => [name, schema.type === 'array' ? [] : 'Local fixture']
      )
    );
    if (captured.length === 1) slots.proposal = JSON.stringify(plan);
    else slots.reply = 'Projection distances do not establish price similarity.';
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
  await native.start(endpoint, undefined, 'generated-selection');
});
test.afterAll(async () => {
  await native?.dispose();
  if (provider?.listening) await new Promise((resolve) => provider.close(resolve));
});
test('PCS saves a native chart shown after restart without rendering or model requests', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  let figureReads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/figure')) figureReads++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByLabel('新样本 CSV').fill('area,rooms\n42.5,2\n182,7\n');
  await page
    .getByLabel('研究或筛选目标')
    .fill('Compare houses and save a rooms versus area chart.');
  await page.getByRole('button', { name: '由 PCS 规划并执行完整研究', exact: true }).click();
  const plot = page.getByRole('region', { name: '房屋分群图', exact: true });
  await expect(plot.getByRole('img')).toBeVisible();
  await expect(plot.getByLabel('分群图横轴')).toHaveValue('rooms');
  await expect(plot.getByLabel('分群图纵轴')).toHaveValue('area');
  expect(
    await plot.getByRole('img').evaluate((img) => img.complete && img.naturalWidth === 960)
  ).toBe(true);
  const original = await plot.getByRole('img').getAttribute('src');
  expect(captured).toHaveLength(2);
  const context = JSON.parse(captured[1].messages[1].content).subjects[1].study.figure;
  expect(context.plotted_rows).toBe(12);
  expect(context.svg).toBeUndefined();
  expect(context.points).toBeUndefined();
  expect(figureReads).toBe(0);
  await native.stop();
  await new Promise((resolve) => provider.close(resolve));
  await native.start(endpoint, undefined, 'generated-selection');
  await page.route(/\/aal-api\/workspaces\/[^/]+\/(command|execute|figure)$/, (route) =>
    route.abort('failed')
  );
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(plot.getByRole('img')).toHaveAttribute('src', original);
  await plot.screenshot({ path: testInfo.outputPath('saved-pcs-figure.png') });
  const pendingDownload = page.waitForEvent('download');
  await plot.getByRole('link', { name: '下载分群 SVG' }).click();
  const downloaded = await pendingDownload;
  expect(await readFile(await downloaded.path(), 'utf8')).toBe(
    decodeURIComponent(original.split(',').slice(1).join(','))
  );
  expect(captured).toHaveLength(2);
  expect(figureReads).toBe(0);
  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n999,2\n');
  await expect(plot.getByRole('img')).toHaveCount(0);
});
