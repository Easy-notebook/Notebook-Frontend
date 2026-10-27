import { test, expect } from '@playwright/test';

test('Agent Cell streams, folds actions, summarizes and continues an isolated conversation', async ({
  page,
}) => {
  const runs = [];
  await page.route('**/agent-api/run', async (route) => {
    const request = route.request().postDataJSON();
    runs.push(request);
    const events = [
      {
        type: 'text',
        text: runs.length === 1 ? 'I inspected the notebook. ' : 'Follow-up complete. ',
      },
      { type: 'tool', callId: crypto.randomUUID(), name: 'list_cells', arguments: {} },
      {
        type: 'tool',
        callId: crypto.randomUUID(),
        name: 'update_cell',
        arguments: {
          cellId: 'notes',
          version: JSON.parse(request.context).cells.find((cell) => cell.cellId === 'notes')
            .version,
          content: 'Revenue analysis updated through the notebook business layer.',
        },
      },
      {
        type: 'tool',
        callId: crypto.randomUUID(),
        name: 'summary',
        arguments: {
          text: 'Inspect missing revenue values before running analysis.',
          cellIds: ['notes'],
        },
      },
      { type: 'text', text: 'The task summary is saved.' },
      { type: 'done' },
    ];
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    });
  });
  const replies = [];
  await page.route('**/agent-api/tool-result', async (route) => {
    replies.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/tests/browser/agent-cell.html');
  await page
    .getByRole('textbox', { name: 'Agent prompt' })
    .fill('Inspect the notebook and summarize.');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(
    page.getByText('I inspected the notebook. The task summary is saved.')
  ).toBeVisible();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  expect(JSON.parse(runs[0].context).cells.map((cell) => cell.cellId)).toEqual([
    'title',
    'notes',
    'agent',
  ]);
  expect(replies).toHaveLength(3);
  expect(replies[1].result.ok).toBe(true);
  await expect(
    page.getByText('Revenue analysis updated through the notebook business layer.', { exact: true })
  ).toBeVisible();
  await expect(
    page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: '行动记录' }) })
      .first()
  ).not.toHaveAttribute('open');
  await page.getByRole('button', { name: '展开全部行动' }).click();
  await expect(page.getByText('list_cells · completed')).toBeVisible();
  await page.getByRole('button', { name: '折叠全部行动' }).click();
  await expect(page.getByText('list_cells · completed')).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Agent prompt' }).fill('Continue');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByText('Follow-up complete. The task summary is saved.')).toBeVisible();
  expect(runs[1].sessionId).toBe(runs[0].sessionId);
  expect(runs[1].runId).not.toBe(runs[0].runId);
  expect(JSON.parse(runs[1].context).summary.text).toContain('revenue');
  await page.screenshot({ path: 'test-results/agent-cell.png', fullPage: true });
});

test('slash menu inserts an Agent Cell without losing surrounding cells', async ({ page }) => {
  await page.goto('/tests/browser/agent-cell.html');
  const editor = page.locator('.ProseMirror');
  await editor.locator(':scope > p').last().click();
  await page.keyboard.type('/');
  await page.getByRole('button', { name: /Agent Cell Codex/ }).click();
  await expect(page.getByRole('region', { name: 'Agent Cell' })).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.agentHarness.store.getState().cells.filter((cell) => cell.type === 'agent').length
      )
    )
    .toBe(2);
  const cells = await page.evaluate(() => window.agentHarness.store.getState().cells);
  expect(cells.filter((cell) => cell.type === 'agent')).toHaveLength(2);
  expect(cells.find((cell) => cell.id === 'notes').content).toContain('Revenue');
  expect(cells.filter((cell) => cell.type === 'agent').every((cell) => !!cell.id)).toBe(true);
});
