import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';

const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
const answer =
  'Observed reference rows 2 and 10 are nearest. Feature distances do not establish house prices.';
let native;
let provider;
let releaseModel;
const captured = [];
test.skip(!binary || !target, 'Set a web,model AAL_NATIVE_SERVER and loopback AAL_NOTEBOOK_TARGET');
test.beforeAll(async () => {
  const modelGate = new Promise((resolve) => {
    releaseModel = resolve;
  });
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    captured.push(payload);
    await modelGate;
    const slots = Object.fromEntries(
      Object.entries(payload.response_format.json_schema.schema.properties).map(
        ([name, schema]) => [name, schema.type === 'array' ? [] : 'Local protocol fixture']
      )
    );
    slots.reply = answer;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(slots),
            },
          },
        ],
      })
    );
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  native = new NativeTestServer(binary, target);
  await native.start(`http://127.0.0.1:${provider.address().port}/v1/chat/completions`);
});
test.afterAll(async () => {
  releaseModel?.();
  await native?.dispose();
  if (provider?.listening) await new Promise((resolve) => provider.close(resolve));
});

test('native housing discussion recovers through read-only lookup after reply loss and restart with the command endpoint blocked', async ({
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
  await page.getByLabel('新样本 CSV').fill('area,rooms\n42.5,2\n182,7\n');
  await page.getByRole('button', { name: '比较并解释相似样本', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始研究讨论', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始研究讨论', exact: true }).click();
  await expect(page.getByLabel('研究问题')).toBeEnabled();
  await expect(page.getByLabel('讨论对象').locator('option')).toHaveCount(15);
  await page.getByLabel('讨论对象').selectOption('data_mining');
  await page
    .getByLabel('研究问题')
    .fill('Explain the measured nearest houses and feature contributions.');
  const commands = [];
  let lost = false;
  await page.route('**/aal-api/workspaces/*/command', async (route) => {
    const command = route.request().postDataJSON();
    if (command.ability !== 'communication') return route.continue();
    commands.push(command);
    if (!lost) {
      const result = await route.fetch();
      expect(result.ok()).toBe(true);
      lost = true;
      await route.abort('failed');
    } else {
      await route.abort('failed'); // Recovery must not reenter the command endpoint.
    }
  });
  await page.getByRole('button', { name: '发送研究问题', exact: true }).click();
  await expect(page.getByRole('status', { name: '原生执行进度' })).toContainText(
    '正在等待模型回答'
  );
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeDisabled();
  expect(captured).toHaveLength(1);
  releaseModel();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  expect(captured).toHaveLength(1);
  const prompt = JSON.parse(captured[0].messages[1].content);
  const context = prompt.subjects[1];
  expect(context.recipient).toBe('data_mining');
  expect(context.study.measurements.rows).toBe(12);
  expect(context.study.comparison.rows[0].neighbors[0].row).toBe(2);
  expect(context.study.comparison.rows[1].neighbors[0].row).toBe(10);
  expect(context.study.comparison.rows[0].neighbors[0].terms).toHaveLength(2);
  const originalRevision = commands[0].arguments.expected_revision;
  await native.stop();
  await new Promise((resolve) => provider.close(resolve));
  await native.start(); // same durable state, model unavailable
  await page.reload();
  await expect(page.getByRole('button', { name: '房屋研究', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(page.getByText('当前服务未启用模型，仍可查看历史讨论。')).toBeVisible();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试原操作', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toHaveCount(0);
  expect(commands).toHaveLength(1);
  expect(captured).toHaveLength(1);
  await expect(page.getByRole('list', { name: '已保存的研究问答' }).locator('li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '发送研究问题', exact: true })).toBeDisabled();
  const state = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const id = store.getState().notebookId;
    return fetch(`/aal-api/workspaces/${encodeURIComponent(id)}/state`).then((response) =>
      response.json()
    );
  });
  expect(state.document.revision).toBe(originalRevision + 1);
  expect(state.document.messages).toHaveLength(1);
  expect(state.study.comparison.rows[1].neighbors[0].row).toBe(10);
  await page.getByRole('button', { name: '写入当前笔记', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已写入并保存当前笔记' })).toBeVisible();
  await page.keyboard.press('Escape');
  const published = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    return store
      .getState()
      .cells.filter((cell) => cell.metadata?.nativeStudy)
      .map((cell) => cell.content)
      .join('\n');
  });
  expect(published).toContain('协作者讨论（模型生成）');
  expect(published).toContain(answer);
});
