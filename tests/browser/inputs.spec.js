import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`input surfaces and autosizing remain consistent at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/browser/inputs.html');
    const search = page.getByRole('textbox', { name: 'Search notebooks' });
    const composer = page.locator('.ai-command-input');
    const textarea = composer.locator('textarea');
    await expect(textarea).toBeVisible();
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Toggle theme' }).click();
      await expect(search).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(textarea).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(textarea).toHaveCSS(
        'color',
        theme === 'dark' ? 'rgb(229, 229, 231)' : 'rgb(32, 33, 36)'
      );
      await search.fill('analysis');
      await expect(search).toHaveValue('analysis');
      await textarea.fill('');
      await expect(composer.locator('.ai-command-input__send')).toBeDisabled();
      await textarea.fill('Short');
      await expect.poll(async () => (await textarea.boundingBox()).height).toBe(36);
      const single = await textarea.boundingBox();
      await textarea.fill('First line\nSecond line\nThird line');
      await expect(composer.locator('.ai-command-input__send')).toBeEnabled();
      await expect
        .poll(async () => (await textarea.boundingBox()).height)
        .toBeGreaterThan(single.height + 30);
      const field = await textarea.boundingBox();
      const send = await composer.locator('.ai-command-input__send').boundingBox();
      expect(field.x + field.width).toBeLessThanOrEqual(send.x);
      await expect
        .poll(() => textarea.evaluate((el) => el.scrollHeight <= el.clientHeight + 1))
        .toBe(true);
      await textarea.fill('Short');
      await expect.poll(async () => (await textarea.boundingBox()).height).toBe(single.height);
      await page.screenshot({ path: `test-results/inputs-${theme}-${width}.png` });
    }
  });
}
