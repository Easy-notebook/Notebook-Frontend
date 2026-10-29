import { chromium } from '@playwright/test';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const input = process.argv[2];
const output = process.argv[3];
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:4186');
const results = [];
for (const file of (await readdir(input)).filter((name) => name.endsWith('.easynb')).sort()) {
  const doc = JSON.parse(await readFile(`${input}/${file}`, 'utf8'));
  const runs = [];
  let run;
  for (const cell of doc.cells) {
    if (
      cell.metadata?.transcriptFormat === 2 &&
      ['tool', 'system'].includes(cell.metadata?.transcriptRole)
    ) {
      if (!run) {
        run = [];
        runs.push(run);
      }
      run.push(cell);
    } else run = undefined;
  }
  await page.locator('input[accept*=easynb]').first().setInputFiles(`${input}/${file}`);
  await page.waitForFunction(
    (n) => document.querySelectorAll('.transcript-activity-group').length === n,
    runs.length
  );
  const groups = page.locator('.transcript-activity-group');
  assert.equal(await page.locator('.transcript-activity-group[open]').count(), 0);
  assert.equal(await page.locator('.transcript-activity').count(), 0);
  const sizes = await groups
    .locator('.transcript-activity-steps')
    .evaluateAll((items) =>
      items.map((item) => item.querySelectorAll('[data-transcript-step-id]').length)
    );
  assert.deepEqual(
    sizes,
    runs.map((run) => run.filter((cell) => cell.metadata?.transcriptRole === 'tool').length)
  );
  assert.equal(
    await page.locator('.notebook-rich-editor table').count(),
    doc.cells.filter((c) => c.metadata?.transcriptKind === 'table').length
  );
  const index = runs.findIndex(
    (run) =>
      run[0].metadata?.transcriptRole === 'tool' &&
      run.filter((c) => c.metadata?.transcriptKind === 'command').length > 1
  );
  assert.ok(index >= 0);
  const group = groups.nth(index);
  await group.locator(':scope > summary').click();
  const steps = group.locator('[data-transcript-step-id]');
  const sample = runs[index].filter((cell) => cell.metadata?.transcriptRole === 'tool');
  const contexts = doc.cells.filter((cell) => cell.metadata?.transcriptRole === 'system');
  assert.equal(await page.locator('[data-transcript-context-id]').count(), contexts.length);
  assert.equal(await page.locator('.transcript-context .transcript-source').count(), 0);
  for (let i = 0; i < runs.length; i++) {
    const calls = runs[i].filter((cell) => cell.metadata?.transcriptRole === 'tool');
    const contextCounts = await groups
      .nth(i)
      .locator('[data-transcript-step-id]')
      .evaluateAll((steps) =>
        steps.map((step) => step.querySelectorAll('[data-transcript-context-id]').length)
      );
    assert.deepEqual(
      contextCounts,
      calls.map(
        (call) =>
          runs[i].filter(
            (cell) =>
              cell.metadata?.transcriptRole === 'system' &&
              cell.metadata?.messageId === call.metadata?.messageId
          ).length
      )
    );
  }
  for (let i = 0; i < sample.length; i++) {
    assert.equal(await steps.nth(i).locator('.transcript-source').textContent(), sample[i].content);
    assert.deepEqual(
      await steps.nth(i).locator('.transcript-output pre').allTextContents(),
      sample[i].outputs.map((o) => String(o.content))
    );
  }
  // Both the group's owning cell and a later cell must remain editable without closing it.
  for (const i of [0, sample.length - 1]) {
    const step = steps.nth(i);
    await step.hover();
    await step
      .locator('.transcript-actions')
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    const source = group.getByRole('textbox', { name: 'Markdown cell source' });
    await source.waitFor({ state: 'visible' });
    const text = await source.inputValue();
    await source.fill(text + '\nGROUP_EDIT_CHECK');
    await group.getByRole('button', { name: 'Preview', exact: true }).click();
    assert.ok(await group.evaluate((el) => el.open));
    assert.equal(
      await step.locator('.transcript-source').textContent(),
      text + '\nGROUP_EDIT_CHECK'
    );
    await step.hover();
    await step
      .locator('.transcript-actions')
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await source.fill(text);
    await group.getByRole('button', { name: 'Preview', exact: true }).click();
  }
  const context = group.locator('[data-transcript-context-id]').first();
  if (await context.count()) {
    await context.hover();
    await context.getByRole('button', { name: '编辑', exact: true }).click();
    const editor = group.getByRole('textbox', { name: 'Markdown cell source' });
    const original = await editor.inputValue();
    await editor.fill(original + ' CONTEXT_EDIT_CHECK');
    await group.getByRole('button', { name: 'Preview', exact: true }).click();
    assert.ok((await context.textContent()).includes('CONTEXT_EDIT_CHECK'));
    await context.hover();
    await context.getByRole('button', { name: '编辑', exact: true }).click();
    await editor.fill(original);
    await group.getByRole('button', { name: 'Preview', exact: true }).click();
  }
  if (file.includes('015747')) {
    await page.mouse.move(10, 10);
    await group.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${output}/tools-expanded.png` });
  }
  await group.locator(':scope > summary').click();
  if (file.includes('015747')) {
    const heading = page.getByRole('heading', {
      name: '不对我说的是分析结果单独分析',
      exact: true,
    });
    await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${output}/tools-collapsed.png` });
  }
  results.push({
    file,
    activityCells: runs.flat().length,
    collapsedGroups: runs.length,
    stepsAndOutputsVerified: sample.length,
    firstAndLastStepEditable: true,
    contextRows: contexts.length,
    contextOwnershipVerified: true,
  });
  console.log(results.at(-1));
}
assert.deepEqual(errors, []);
await writeFile(`${output}/group-verification.json`, JSON.stringify({ results, errors }, null, 2));
await browser.close();
