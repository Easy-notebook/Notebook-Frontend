import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import process from 'node:process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NativeTestServer } from './support/nativeServer.js';
const run = promisify(execFile);
const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
const assign = process.env.AAL_NATIVE_ASSIGN;
const skills = process.env.AAL_SKILLS_CLI;
let native;
let provider;
let endpoint;
const captured = [];
const reviewCsv = 'rooms,area\n2,47\n4,113\n7,195\n';
test.skip(
  !binary || !target || !assign || !skills,
  'Set local native server, assign, skills CLI and loopback target'
);
test.beforeAll(async () => {
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    captured.push(JSON.parse(body));
    const step =
      captured.length === 1
        ? { tool: 'assign', arguments: { csv: reviewCsv } }
        : { result: 'Browser fixture: measured frozen housing groups.' };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify({ step }) },
          },
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

test('selects a packaged housing model after source deletion and server restart', async ({
  page,
}, testInfo) => {
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
  await page.getByRole('button', { name: '执行房屋分群', exact: true }).click();
  await expect(page.getByRole('button', { name: '导出二进制模型', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '导出二进制模型', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存 .aalkm 文件', exact: true }).click();
  const downloaded = await downloading;
  const modelPath = testInfo.outputPath('model.aalkm');
  await downloaded.saveAs(modelPath);

  const directory = testInfo.outputPath('source');
  await mkdir(join(directory, 'models'), { recursive: true });
  await writeFile(
    join(directory, 'SKILL.md'),
    '---\nname: house-feature-review\ndescription: Frozen housing model for the browser fixture\nallowed-tools: [profile, assign]\n---\nUse the measured model.\n'
  );
  await writeFile(join(directory, 'models/houses.aalkm'), await readFile(modelPath));
  const archive = testInfo.outputPath('houses.zip');
  const lockPath = testInfo.outputPath('skills.lock.json');
  await run(skills, ['pack-dir', directory, 'house-feature-review', archive]);
  await rm(directory, { recursive: true });
  await native.stop();
  const csv = 'rooms,area\n2,47\n4,113\n7,195\n';
  const query = testInfo.outputPath('query.csv');
  await writeFile(query, csv);
  const expected = JSON.parse(
    (
      await run(assign, [
        modelPath,
        query,
        testInfo.outputPath('offline'),
        'packaged-browser-check',
      ])
    ).stdout
  );
  await native.start(endpoint);
  await page.getByLabel('技能档案文件').setInputFiles(archive);
  await page.getByRole('button', { name: '检查技能档案', exact: true }).click();
  await expect(page.getByText('扫描结果：需要注意', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '接受档案内容', exact: true })).toBeDisabled();
  expect(captured).toHaveLength(0);
  await page.getByLabel('审核人', { exact: true }).fill('automated-browser-fixture');
  await page
    .getByLabel('审核说明', { exact: true })
    .fill('Synthetic fixture; verified original model bytes.');
  await page.getByLabel('我已核对本次档案内容').check();
  await page.getByRole('button', { name: '接受档案内容', exact: true }).click();
  await expect(page.getByText('内容已接受，尚未授权技能执行。', { exact: true })).toBeVisible();
  expect(captured).toHaveLength(0);
  const lockDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载已审核锁文件', exact: true }).click();
  await (await lockDownload).saveAs(lockPath);
  const acceptedLock = JSON.parse(await readFile(lockPath, 'utf8'));
  const unpacked = { content_hash: acceptedLock.skills[0].resource.content_hash };
  await page.getByRole('button', { name: '使用档案中的房屋模型', exact: true }).click();
  const picker = page.getByRole('combobox', { name: '技能包中的房屋模型' });
  await expect(picker).toBeVisible();
  await expect(picker.locator('option')).toHaveCount(2);
  await page.getByLabel('导入模型的新样本 CSV').fill(csv);
  const submit = page.getByRole('button', { name: '使用导入模型分群', exact: true });
  await expect(submit).toBeDisabled();
  await picker.selectOption('0');
  await expect(
    page.getByText(`来源校验值：${unpacked.content_hash}`, { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: '检查技能工具绑定', exact: true }).click();
  const preview = page.getByLabel('已核对技能工具');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('尚未授权执行');
  await expect(preview).toContainText('读取 CSV 概况');
  await expect(preview).toContainText('使用冻结模型分群');
  await expect(preview.locator('li')).toHaveCount(2);
  const assigned = page.waitForResponse(
    (response) => response.url().endsWith('/model-assignment') && response.ok()
  );
  await submit.click();
  expect((await (await assigned).json()).assignments).toEqual(expected);
  const result = page.getByLabel('导入模型分群结果');
  await expect(result.locator('summary')).toHaveCount(3);
  await result.locator('summary').first().click();
  await expect(result).toContainText('area：原值 47');

  const corrupt = JSON.parse(await readFile(lockPath, 'utf8'));
  corrupt.skills[0].resource.package.binary_files['models/houses.aalkm'][20] ^= 1;
  await page.getByLabel('冻结分群模型文件').setInputFiles({
    name: 'tampered.lock.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });
  await expect(page.getByLabel('导入房屋分群模型').getByRole('alert')).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(result).toHaveCount(0);
  await page.getByLabel('冻结分群模型文件').setInputFiles(lockPath);
  await picker.selectOption('0');
  await page.getByRole('button', { name: '检查技能工具绑定', exact: true }).click();
  await expect(page.getByLabel('已核对技能工具')).toBeVisible();
  await page.getByRole('button', { name: '保存本次技能调用供审批', exact: true }).click();
  await expect(page.getByRole('button', { name: '批准本次技能调用', exact: true })).toBeVisible();
  expect(captured).toHaveLength(0);
  await page.getByRole('button', { name: '批准本次技能调用', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '执行已批准的技能调用', exact: true })
  ).toBeVisible();
  expect(captured).toHaveLength(0);
  await page.route('**/skill-review/execute', async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed'); // Native completion is retained, browser loses its response.
  });
  await page.getByRole('button', { name: '执行已批准的技能调用', exact: true }).click();
  await expect(page.getByLabel('技能审批与执行').getByRole('alert')).toBeVisible();
  expect(captured).toHaveLength(2);
  expect(JSON.parse(captured[1].messages[3].content).tool_result.output).toEqual(expected);
  await page.unroute('**/skill-review/execute');
  // Keep the lost-response invocation frozen while the notebook advances.
  await page
    .getByLabel('参考 CSV 内容')
    .fill('area,rooms\n50,2\n60,3\n100,4\n110,4\n190,7\n200,7\n');
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '取回原调用结果', exact: true })).toBeEnabled();
  await native.stop();
  await new Promise((resolve) => provider.close(resolve));
  await native.start(endpoint); // Same deployment, provider offline.
  await page.reload();
  await expect(page.getByRole('heading', { name: '房屋特征研究', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(page.getByLabel('技能审批与执行')).toBeVisible();
  await testInfo.attach('recovery-state', {
    body: JSON.stringify(
      await page.evaluate(() => ({
        records: Object.keys(sessionStorage)
          .filter((key) => key.startsWith('aal-skill-review:'))
          .map((key) => {
            const record = JSON.parse(sessionStorage.getItem(key));
            return { key, phase: record.phase, workspace: record.input.workspace };
          }),
        text: document.querySelector('[aria-label="技能审批与执行"]')?.textContent,
      }))
    ),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: '取回原调用结果', exact: true }).click();
  await expect(page.getByLabel('技能执行结果')).toContainText(
    'Browser fixture: measured frozen housing groups.'
  );
  await expect(
    page.getByText('此结果来自历史版本，不代表当前研究输入。', { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('参考 CSV 内容')).toHaveValue(
    'area,rooms\n50,2\n60,3\n100,4\n110,4\n190,7\n200,7\n'
  );
  expect(captured).toHaveLength(2);
  expect(errors).toEqual([]);
});
