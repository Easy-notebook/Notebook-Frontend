import { marked } from 'marked';
import { chromium } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = process.argv[2];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4186');
const results = [];
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.easynb')).sort()) {
  const doc = JSON.parse(await readFile(`${dir}/${file}`, 'utf8'));
  await page.locator('input[accept*="easynb"]').first().setInputFiles(`${dir}/${file}`);
  const firstPrompt = doc.cells.find((c) => c.metadata?.transcriptRole === 'user');
  await page
    .getByRole('heading', {
      name: firstPrompt.content.split('\n')[0].replace(/^## /, ''),
      exact: true,
    })
    .first()
    .waitFor({ timeout: 60000 });
  const rich = doc.cells.filter(
    (c) => c.type === 'markdown' && ['prose', 'table'].includes(c.metadata?.transcriptKind)
  );
  const tables = doc.cells.filter((c) => c.metadata?.transcriptKind === 'table');
  const prompts = doc.cells.filter(
    (c) => c.metadata?.transcriptRole === 'user' && c.metadata?.messageStart
  );
  assert.equal(await page.locator('.notebook-markdown-node').count(), rich.length);
  const headings = await page.locator('.notebook-markdown-node h2').allTextContents();
  for (const prompt of prompts) {
    const expected = await page.evaluate(
      (html) => new DOMParser().parseFromString(html, 'text/html').body.textContent.trim(),
      marked.parse(prompt.content.split('\n')[0])
    );
    assert.ok(
      headings.some((text) => text.replace(/\s+/g, ' ').trim() === expected.replace(/\s+/g, ' ').trim()),
      file + ': request heading: ' + expected
    );
  }
  const native = await page.locator('.notebook-rich-editor table').count();
  assert.equal(native, tables.length, `${file}: native tables`);
  assert.equal(await page.locator('.claude-transcript[data-transcript-kind="prose"]').count(), 0);
  assert.equal(await page.locator('.transcript-activity-group[open]').count(), 0);
  const command = page.locator('[data-transcript-kind="command"]').first();
  const activityGroup = page.locator('.transcript-activity-group').filter({ has: command }).first();
  await activityGroup.locator(':scope > summary').click();
  assert.ok(await command.locator('.transcript-output pre').first().isVisible());
  await activityGroup.locator(':scope > summary').click();
  if (file.includes('015747')) {
    const code = page
      .locator('[data-transcript-kind="code"]')
      .filter({ hasText: 'class Decision' });
    await code.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${dir}/code-and-table.png` });
    await code.hover();
    await code.getByRole('button', { name: '编辑', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Markdown cell source' });
    const original = await input.inputValue();
    await input.fill(original + '\n# reviewed');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    assert.ok((await code.textContent()).includes('# reviewed'));
    await code.hover();
    await code.getByRole('button', { name: '编辑', exact: true }).click();
    await input.fill(original);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const request = page.getByRole('heading', { name: /如果你设计项目代码尽可能展示清楚/ }).first();
    await request.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${dir}/conversation.png` });
  }
  if (file.includes('015944')) {
    const table = page
      .locator('.notebook-rich-editor table')
      .filter({ hasText: 'gold 和输入' })
      .first();
    await table.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${dir}/comparison-table.png` });
  }
  results.push({
    file,
    markdownCells: rich.length,
    prompts: prompts.length,
    tables: native,
    toolOutputExpanded: true,
  });
  console.log(results.at(-1));
}
const heading = page.locator('.notebook-markdown-node h2').first();
await heading.click();
await page.keyboard.press('End');
await page.keyboard.type(' EDIT_CHECK');
assert.ok((await heading.textContent()).includes('EDIT_CHECK'));
await page.waitForTimeout(800);
await page.reload();
await page.getByRole('heading', { name: /EDIT_CHECK/ }).waitFor();
const markdownEditPersisted = true;
await writeFile(
  `${dir}/browser-verification.json`,
  JSON.stringify({ results, errors, markdownEditPersisted }, null, 2)
);
assert.deepEqual(errors, []);
await browser.close();
