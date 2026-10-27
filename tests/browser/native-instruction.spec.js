import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';

const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
const original = 'Explain the nearest observed housing samples and their feature contributions.';
const revised =
  'Explain nearest observed housing samples using standardized squared distances and per-feature contributions.';
const captured = [];
let native;
let provider;
let endpoint;
test.skip(!binary || !target, 'Set a web,model AAL_NATIVE_SERVER and loopback AAL_NOTEBOOK_TARGET');
test.beforeAll(async () => {
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    captured.push(payload);
    const slots = Object.fromEntries(
      Object.entries(payload.response_format.json_schema.schema.properties).map(
        ([name, schema]) => [name, schema.type === 'array' ? [] : 'Local protocol fixture']
      )
    );
    if ('existing' in slots) {
      slots.existing = original;
      slots.replacement = revised;
      slots.rationale = 'Clarify measured distance units without changing the computed comparison';
    } else
      slots.reply =
        'The first query matches observed row 0. Distance does not establish a price estimate.';
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
test('housing feedback revises the native instruction, replays after response loss and restart, and changes later discussion context without changing measurements', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page.getByText('调整房屋解释说明', { exact: true }).click();
  await expect(page.getByLabel('解释改进反馈')).toBeDisabled();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行房屋分群', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '执行房屋分群', exact: true }).click();
  await expect(page.getByRole('button', { name: '比较并解释相似样本', exact: true })).toBeEnabled();
  await page.getByLabel('新样本 CSV').fill('area,rooms\n40,2\n182,7\n');
  await page.getByRole('button', { name: '比较并解释相似样本', exact: true }).click();
  await expect(page.getByLabel('解释改进反馈')).toBeEnabled();
  const state = () =>
    page.evaluate(async () => {
      const store = (await import('/src/store/notebookStore.ts')).default;
      const id = store.getState().notebookId;
      return fetch(`/aal-api/workspaces/${encodeURIComponent(id)}/state`).then((response) =>
        response.json()
      );
    });
  const before = await state();
  await page
    .getByLabel('解释改进反馈')
    .fill(
      'Explain standardized distance units; preserve original row indices and distinguish price estimates.'
    );
  const commands = [];
  let lost = false;
  await page.route('**/aal-api/workspaces/*/command', async (route) => {
    const command = route.request().postDataJSON();
    if (command.ability !== 'revise_discussion_instruction') return route.continue();
    commands.push(command);
    if (!lost) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      lost = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: '根据反馈修订说明', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toBeEnabled();
  expect(captured).toHaveLength(1);
  const prompt = JSON.parse(captured[0].messages[1].content);
  expect(prompt.subjects[2].study.comparison.rows).toEqual(before.study.comparison.rows);
  expect(prompt.subjects[0]).toEqual(before.study.discussion_instruction);
  await native.stop();
  await native.start();
  await page.reload();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page.getByText('调整房屋解释说明', { exact: true }).click();
  await expect(page.getByLabel('当前房屋解释说明')).toContainText(revised);
  await page.getByRole('button', { name: '重试原操作', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试原操作', exact: true })).toHaveCount(0);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(captured).toHaveLength(1);
  const after = await state();
  expect(after.document.revision).toBe(before.document.revision + 1);
  expect(after.study.discussion_instruction.descriptor.revision).toBe(2);
  expect(after.study.comparison).toEqual(before.study.comparison);
  await expect(page.getByLabel('解释改进反馈')).toBeDisabled();
  await native.stop();
  await native.start(endpoint);
  await page.getByRole('button', { name: '刷新研究', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始研究讨论', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始研究讨论', exact: true }).click();
  await expect(page.getByLabel('研究问题')).toBeEnabled();
  await page.getByLabel('讨论对象').selectOption('data_mining');
  await page.getByLabel('研究问题').fill('Explain the measured nearest row.');
  await page.getByRole('button', { name: '发送研究问题', exact: true }).click();
  await expect(page.getByRole('list', { name: '已保存的研究问答' }).locator('li')).toHaveCount(1);
  expect(captured).toHaveLength(2);
  const replyPrompt = JSON.parse(captured[1].messages[1].content);
  expect(replyPrompt.clauses[0].instruction).toContain(revised);
  expect(replyPrompt.subjects[1].discussion_instruction.descriptor.revision).toBe(2);
  expect((await state()).study.comparison).toEqual(before.study.comparison);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page.getByText('调整房屋解释说明', { exact: true }).click();
  await expect(page.getByLabel('当前房屋解释说明')).toContainText(original);
  expect((await state()).study.discussion_instruction.descriptor.revision).toBe(1);
});
