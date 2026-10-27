import { test, expect } from '@playwright/test';

async function seedConversation(page) {
  await page.evaluate(() => {
    const state = window.agentHarness.store.getState();
    const agent = state.cells.find((cell) => cell.id === 'agent').metadata.agent;
    state.updateCellMetadata('agent', {
      agent: {
        ...agent,
        turns: [
          {
            id: 'knowledge-turn',
            prompt: 'Reduce uncertainty before changing the model.',
            answer: 'The revenue file has three missing values. Inspect the raw file next.',
            actions: [],
            status: 'completed',
          },
        ],
      },
    });
  });
}
async function capture(page, role, kind, title) {
  const content = page
    .locator('[data-context-source="knowledge-turn"]')
    .nth(role === 'user' ? 0 : 1);
  await content.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('摘录类型').selectOption(kind);
  await page.getByLabel('摘录标题').fill(title);
  await page.getByRole('button', { name: '保存摘录', exact: true }).click();
  await expect(page.getByText(/已存入.*上下文档案/).last()).toBeVisible();
}

test('selected evidence survives chat reset, curator updates readable folders and future runs receive context', async ({
  page,
}) => {
  const requests = [];
  await page.route('**/agent-api/run', async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const context = JSON.parse(request.context).durableContext;
    const events =
      request.role === 'curator'
        ? [
            { type: 'tool', callId: crypto.randomUUID(), name: 'read_context', arguments: {} },
            {
              type: 'tool',
              callId: crypto.randomUUID(),
              name: 'curate_context',
              arguments: {
                expectedVersion: context.version,
                overview: '三处缺失值需要回到原始文件核对。',
                startingPoint: '降低不确定性后再修改模型。',
                openQuestions: '缺失值是否来自导入？',
                nextSteps: '检查原始行并记录证据。',
                references: [...context.startingPoints, ...context.facts].map((entry) => entry.id),
                annotations: [],
              },
            },
            { type: 'text', text: '已维护出发点、证据与下一步。' },
            { type: 'done' },
          ]
        : [{ type: 'text', text: '上下文已读取。' }, { type: 'done' }];
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    });
  });
  await page.route('**/agent-api/tool-result', (route) => route.fulfill({ json: { ok: true } }));
  await page.goto('/tests/browser/agent-cell.html');
  await page.waitForFunction(() => !!window.agentHarness);
  await seedConversation(page);
  await capture(page, 'user', 'origin', '先降低不确定性');
  await capture(page, 'assistant', 'fact', '收入文件的缺失值');
  const panel = page.getByRole('region', { name: '上下文档案' });
  await expect(panel.getByRole('article', { name: '上下文文档' })).toContainText(
    'Reduce uncertainty'
  );
  await panel.getByRole('button', { name: '整理上下文', exact: true }).click();
  await expect(page.getByText('已维护出发点、证据与下一步。')).toBeVisible();
  await expect(panel.getByRole('article', { name: '上下文文档' })).toContainText('三处缺失值');
  expect(requests[0].role).toBe('curator');
  const filenames = await page.evaluate(async () =>
    (
      await window.agentHarness.persistenceService.files.getFilesForNotebook(
        'agent-browser-fixture'
      )
    ).map((file) => file.metadata.filePath)
  );
  expect(filenames).toEqual(
    expect.arrayContaining([
      'notebook-context/README.md',
      'notebook-context/30-context/current.md',
      'notebook-context/90-history/v3.md',
    ])
  );
  await page.screenshot({ path: 'test-results/notebook-context.png', fullPage: true });
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出 ZIP' }).click();
  expect((await download).suggestedFilename()).toContain('notebook-context');
  await page.reload(); // fixture resets the chat; evidence is independently persisted
  await page.getByRole('textbox', { name: 'Agent prompt' }).fill('继续检查数据');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.getByText('上下文已读取。')).toBeVisible();
  const durable = JSON.parse(requests[1].context).durableContext;
  expect(durable.startingPoints[0].quote).toContain('Reduce uncertainty');
  expect(durable.facts[0].quote).toContain('three missing values');
  expect(durable.curated.overview).toContain('三处缺失值');
});

test('file-set revision conflicts and aborted writes never partially replace context files', async ({
  page,
}) => {
  await page.goto('/tests/browser/agent-cell.html');
  await page.waitForFunction(() => !!window.agentHarness);
  const result = await page.evaluate(async () => {
    const files = window.agentHarness.persistenceService.files;
    const make = (filePath, content) => ({
      notebookId: 'atomic-book',
      filePath,
      fileName: filePath,
      content,
      size: content.length,
      lastModified: 'now',
    });
    await files.saveFileSet([make('state.json', 'v1'), make('readme.md', 'first')]);
    const replies = await Promise.allSettled([
      files.saveFileSet(
        [make('state.json', 'v2'), make('readme.md', 'second')],
        {},
        { notebookId: 'atomic-book', filePath: 'state.json', expectedContent: 'v1' }
      ),
      files.saveFileSet(
        [make('state.json', 'v3'), make('readme.md', 'third')],
        {},
        { notebookId: 'atomic-book', filePath: 'state.json', expectedContent: 'v1' }
      ),
    ]);
    try {
      await files.saveFileSet([
        make('readme.md', 'partial'),
        { ...make('broken.md', 'bad'), size: -1 },
      ]);
    } catch {
      /* the earlier write must roll back too */
    }
    const broken = await files.getFile('atomic-book', 'broken.md');
    const marker = (await files.getFile('atomic-book', 'state.json')).content;
    const readme = (await files.getFile('atomic-book', 'readme.md')).content;
    const controller = new AbortController();
    controller.abort();
    try {
      await files.saveFileSet([make('readme.md', 'cancelled')], {}, undefined, controller.signal);
    } catch {
      /* expected */
    }
    return {
      broken,
      statuses: replies.map((reply) => reply.status),
      marker,
      readme,
      after: (await files.getFile('atomic-book', 'readme.md')).content,
    };
  });
  expect(result.statuses.filter((status) => status === 'fulfilled')).toHaveLength(1);
  expect(result.readme).toBe(result.marker === 'v2' ? 'second' : 'third');
  expect(result.after).toBe(result.readme);
  expect(result.broken).toBeNull();
});
