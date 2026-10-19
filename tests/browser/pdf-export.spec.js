import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/storage.html');
});

test('exports Chinese prose, bold headings, hybrid code and output to an actual PDF', async ({
  page,
}, testInfo) => {
  const download = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { exportToPdf } = await import('/src/utils/exportToFile/exportToPDF.ts');
    await exportToPdf([
      {
        id: 'intro',
        type: 'markdown',
        content: '# 中文导出验证\n\n常规中文与 **粗体中文**，English text 123。',
      },
      {
        id: 'hybrid',
        type: 'hybrid',
        content: '计算说明\n\n```python\nprint(1 + 2)\n```\n\n计算结束',
        outputs: [{ type: 'text', content: '结果：3' }],
      },
      {
        id: 'empty',
        type: 'code',
        content: '',
        outputs: [{ type: 'text', content: '保留空代码的输出' }],
      },
    ]);
  });
  const file = await download;
  expect(file.suggestedFilename()).toBe('notebook.pdf');
  const path = testInfo.outputPath('chinese-export.pdf');
  await file.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(1000);
});

test('rejects unavailable font and allows the next export to retry', async ({ page }, testInfo) => {
  const failures = [];
  page.on('download', () => failures.push('download'));
  await page.route('**/fonts/NotoSansSC-Regular.ttf', (route) =>
    route.fulfill({ status: 404, body: 'missing' })
  );
  const error = await page.evaluate(async () => {
    const { exportToPdf } = await import('/src/utils/exportToFile/exportToPDF.ts');
    try {
      await exportToPdf([{ id: 'a', type: 'markdown', content: '中文' }]);
      return null;
    } catch (failure) {
      return failure.message;
    }
  });
  expect(error).toContain('HTTP 404');
  expect(failures).toEqual([]);
  await page.unroute('**/fonts/NotoSansSC-Regular.ttf');
  const download = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { exportToPdf } = await import('/src/utils/exportToFile/exportToPDF.ts');
    await exportToPdf([{ id: 'a', type: 'markdown', content: '恢复中文导出' }]);
  });
  await (await download).saveAs(testInfo.outputPath('retry-export.pdf'));
});
