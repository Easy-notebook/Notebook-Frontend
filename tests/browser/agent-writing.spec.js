import { test, expect } from '@playwright/test';
test('agent intent, reservation, generation and cleanup stay outside document content', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/browser/agent-writing.html');
  const method = page.locator('.notebook-rich-editor > [data-cell-id="method"]');
  const other = page.locator('.notebook-rich-editor > [data-cell-id="experiment"]');
  const overlay = page.locator('[data-writing-cell="method"]');
  await page.getByRole('button', { name: '提案', exact: true }).click();
  await expect(overlay).toHaveAttribute('data-writing-phase', 'proposed');
  await expect(overlay.locator('.agent-writing-name')).toHaveText('Claude');
  await expect(method).toHaveAttribute('data-agent-locked', 'Claude');
  await expect(overlay.locator('.agent-shiny-text').first()).toBeVisible();
  await overlay.locator('p').click();
  await page.keyboard.type('SHOULD_NOT_APPEAR');
  await expect(method).not.toContainText('SHOULD_NOT_APPEAR');
  await page.evaluate(() => {
    const start = document.querySelector('.notebook-rich-editor > [data-cell-id="method"]');
    const end = document.querySelector('.notebook-rich-editor > [data-cell-id="experiment"]');
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.childNodes.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await expect(method).toContainText('当前方法说明');
  await expect(other).toContainText('实验设计');
  await other.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('STILL_EDITABLE');
  await expect(other).toContainText('STILL_EDITABLE');
  await page.getByRole('button', { name: '开始生成', exact: true }).click();
  await expect(overlay.locator('.agent-writing-intent')).toHaveCount(0);
  await expect(overlay.locator('.agent-writing-status')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(overlay).toHaveAttribute('data-writing-phase', 'generating');
  await page.getByRole('button', { name: '尝试外部覆盖' }).click();
  await expect(page.getByRole('alert')).toContainText('AGENT_EDIT_LOCKED');
  await expect(method).not.toContainText('ILLEGAL');
  await page.getByRole('button', { name: '生成草稿' }).click();
  await expect(overlay.locator('.agent-writing-draft')).toContainText('每个团队');
  await expect(overlay.locator('.agent-writing-draft .agent-shiny-text').first()).toHaveCSS(
    'animation-name',
    'agent-writing-shine'
  );
  const caretLabel = await overlay.locator('.agent-writing-name').boundingBox();
  expect(caretLabel.width).toBeGreaterThan(35);
  expect(caretLabel.height).toBeLessThan(28);
  await page.getByRole('button', { name: '查看保存内容' }).click();
  const saved = JSON.parse(await page.locator('[data-export]').textContent());
  expect(saved.find((cell) => cell.id === 'method').content).toContain('当前方法说明');
  expect(saved.find((cell) => cell.id === 'method').content).not.toContain('每个团队');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/agent-writing-dark.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(overlay.locator('.agent-writing-draft .agent-shiny-text').first()).toHaveCSS(
    'animation-name',
    'none'
  );
  await other.locator('p').click();
  await page.keyboard.press('End');
  const selectionBefore = await page.evaluate(() => ({
    text: window.getSelection().anchorNode.textContent,
    offset: window.getSelection().anchorOffset,
  }));
  await page.getByRole('button', { name: '完成修改' }).evaluate((button) => button.click());
  await expect(overlay).toHaveCount(0);
  await expect(method).not.toHaveAttribute('data-agent-locked', 'Claude');
  await expect(method).toContainText('形式化对象');
  expect(
    await page.evaluate(() => ({
      text: window.getSelection().anchorNode.textContent,
      offset: window.getSelection().anchorOffset,
    }))
  ).toEqual(selectionBefore);
  await expect(other).toContainText('STILL_EDITABLE');
  await page.getByRole('button', { name: '开始生成' }).click();
  await page.getByRole('button', { name: '取消修改' }).click();
  await expect(overlay).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('code editing is read-only during an agent reservation and returns on cancellation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/browser/agent-writing.html');
  const code = page.locator('.notebook-rich-editor > [data-cell-id="code"]');
  await code.scrollIntoViewIfNeeded();
  if (await code.locator('pre').count()) await code.locator('pre').click();
  await expect(code.locator('.cm-content')).toBeVisible();
  await page.getByRole('button', { name: '冻结代码' }).click();
  await code.locator('.cm-content').click();
  await page.keyboard.type('INVALID');
  await expect(code.locator('.cm-content')).not.toContainText('INVALID');
  await page.getByRole('button', { name: '停止 Agent' }).click();
  await expect(page.locator('[data-writing-cell="code"]')).toHaveCount(0);
  await code.locator('.cm-content').click();
  await page.keyboard.type('valid');
  await expect(code.locator('.cm-content')).toContainText('valid');
});

test('agent Markdown uses the document grammar and typography before and after commit', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/agent-writing.html');
  await page.getByRole('button', { name: 'Markdown 草稿', exact: true }).click();
  const preview = page.locator('.agent-writing-draft .agent-markdown-preview');
  await expect(preview).toHaveAttribute('contenteditable', 'false');
  await expect(preview).toHaveCSS('min-height', '0px');
  await expect(preview.locator('.notebook-text-code')).not.toHaveCSS(
    '-webkit-text-fill-color',
    'rgba(0, 0, 0, 0)'
  );
  await expect(preview.locator('h2')).toHaveText('方法与验证');
  await expect(preview.locator('table')).toHaveCount(1);
  await expect(preview.locator('li')).toHaveCount(2);
  await expect(preview.locator('.notebook-fenced-code')).toContainText('print(42)');
  await expect(preview.locator('.katex').first()).toBeVisible();
  await expect(page.locator('.agent-writing-intent')).toHaveCount(0);
  const describe = (element) =>
    Array.from(element.querySelectorAll('h2,p,strong,em,a,ul,li,table,th,td,pre,code,.katex')).map(
      (node) => {
        const style = getComputedStyle(node);
        return {
          tag: node.tagName,
          text: node.textContent,
          font: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
          lineHeight: style.lineHeight,
          margin: style.margin,
          padding: style.padding,
        };
      }
    );
  const generated = await preview.evaluate(describe);
  await page.screenshot({ path: 'test-results/agent-markdown-preview.png', fullPage: true });
  await page.getByRole('button', { name: '查看保存内容' }).click();
  expect(
    JSON.parse(await page.locator('[data-export]').textContent()).find(
      (cell) => cell.id === 'method'
    ).content
  ).toContain('当前方法说明');
  await page.getByRole('button', { name: '提交 Markdown', exact: true }).click();
  const committed = page.locator('.notebook-rich-editor > [data-cell-id="method"]');
  await expect(page.locator('.agent-writing-decoration')).toHaveCount(0);
  await expect(committed.locator('.katex').first()).toBeVisible();
  expect(await committed.evaluate(describe)).toEqual(generated);
  expect(errors).toEqual([]);
});

test('inserts Markdown into the middle of an existing paragraph and retains the cell', async ({
  page,
}) => {
  await page.goto('/tests/browser/agent-writing.html');
  await page.getByRole('button', { name: '段内插入', exact: true }).click();
  const draft = page.locator('.agent-writing-draft');
  await expect(draft.locator('strong')).toHaveText('新增论证');
  await expect(draft).toContainText('当前方法说明，新增论证');
  await expect(draft).toContainText('需要补充可验证的口径接口与形式化对象。');
  const cell = page.locator('.notebook-rich-editor > [data-cell-id="method"]');
  await expect(cell).not.toContainText('新增论证');
  await page.getByRole('button', { name: '提交插入', exact: true }).click();
  await expect(page.locator('.agent-writing-decoration')).toHaveCount(0);
  await expect(cell.locator('strong')).toHaveText('新增论证');
  await expect(cell.locator('h2')).toHaveText('方法');
  await page.getByRole('button', { name: '查看保存内容' }).click();
  const cells = JSON.parse(await page.locator('[data-export]').textContent());
  expect(cells.find((cell) => cell.id === 'method')).toMatchObject({
    type: 'markdown',
    content:
      '## 方法\n\n当前方法说明，**新增论证**与 $x^2$，需要补充可验证的口径接口与形式化对象。',
  });
});

test('outline nodes stay gray without duplicate cursors; typing retains a continuous shine clock', async ({
  page,
}) => {
  await page.goto('/tests/browser/agent-writing.html');
  await page.getByRole('button', { name: '灰色框架', exact: true }).click();
  const planned = page.locator('[data-agent-operation]');
  await expect(planned).toHaveCount(2);
  await expect(planned.locator('.agent-writing-caret')).toHaveCount(0);
  await expect(page.locator('.agent-outline-target')).toHaveCount(2);
  await expect(planned.locator('.agent-shiny-text')).toHaveCount(0);
  await page.getByRole('button', { name: '思考当前章节', exact: true }).click();
  await expect(planned.locator('.agent-writing-caret')).toHaveCount(1);
  await expect(planned.locator('.agent-shiny-text')).toHaveCount(1);
  await expect(page.locator('.agent-outline-target[aria-busy="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: '逐字展开框架', exact: true }).click();
  const active = page.locator('[data-writing-phase="generating"]');
  await expect(active).toHaveCount(1);
  await expect(planned.locator('.agent-writing-caret')).toHaveCount(1);
  const text = active.locator('.agent-writing-draft p');
  await expect(text).toContainText('先明确');
  const prefix = await text.textContent();
  expect(prefix.length).toBeLessThan(125);
  const initialDelay = parseFloat(
    await text
      .locator('[data-lexical-text]')
      .getAttribute('style')
      .then((value) => value.match(/animation-delay:\s*(-?[\d.]+)/)[1])
  );
  await expect(text).toContainText('只有当前正在写作');
  const nextDelay = parseFloat(
    await text
      .locator('[data-lexical-text]')
      .getAttribute('style')
      .then((value) => value.match(/animation-delay:\s*(-?[\d.]+)/)[1])
  );
  expect(nextDelay).toBeLessThan(initialDelay);
  await expect(text).toContainText('其他待写节点仍保留为灰色框架。');
});
