import { test, expect } from '@playwright/test';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';

const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
let native;
test.skip(!binary || !target, 'Set AAL_NATIVE_SERVER and loopback AAL_NOTEBOOK_TARGET');
test.beforeAll(async () => {
  native = new NativeTestServer(binary, target);
  await native.start();
});
test.afterAll(async () => {
  await native?.dispose();
});

test('native error diagnostics survive a lost response, Rust restart and browser reload', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await expect(page.getByLabel('参考 CSV 内容')).toBeVisible();
  await page.getByLabel('参考 CSV 内容').fill('area,rooms\n40,2\n41,2\n42,2\n90,4\n91,4\n92,4\n');
  await page.getByLabel('数值特征（每行一个）').fill('area\nrooms');
  await page.getByLabel('分群数量', { exact: true }).fill('2');
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行房屋分群', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.waitForFunction(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    return !!store.getState().notebookId;
  });
  const source =
    'agent Cell is Agent\n  public\n    ability run() -> Any effects()\n      return 100 / 0\n';
  let committed;
  await page.route(
    '**/aal-api/workspaces/*/execute',
    async (route) => {
      committed = await (await route.fetch()).json();
      await route.abort('failed');
    },
    { times: 1 }
  );
  const first = await page.evaluate(async (content) => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const { publishNotebookCells } = await import(
      '/src/services/native-study/publishNotebookCells.ts'
    );
    const id = crypto.randomUUID();
    await publishNotebookCells(store.getState().notebookId, () => [
      { id, type: 'code', language: 'aal', content },
    ]);
    const outcome = await store.getState().runSingleCell(id);
    return { id, outcome };
  }, source);
  expect(first.outcome.success).toBe(false);
  expect(committed, JSON.stringify(first)).toBeDefined();
  expect(committed.status, JSON.stringify(committed)).toBe('error');
  expect(committed.outputs[0].metadata.diagnostics[0]).toMatchObject({
    phase: 'runtime',
    code: 'E_VALUE',
    span: { line: 4, column: 14 },
  });
  await native.stop();
  await native.start();
  let lookup;
  await page.route('**/aal-api/workspaces/*/executions/lookup', async (route) => {
    const response = await route.fetch();
    lookup = await response.json();
    await route.fulfill({ response });
  });
  const recovered = await page.evaluate(async (id) => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const outcome = await store.getState().runSingleCell(id);
    return { outcome, outputs: store.getState().cells.find((cell) => cell.id === id).outputs };
  }, first.id);
  expect(recovered.outcome.success).toBe(false);
  expect(lookup.status).toBe('completed');
  expect(lookup.result).toEqual(committed);
  expect(recovered.outputs.find((output) => output.metadata?.diagnostics).metadata).toEqual(
    committed.outputs[0].metadata
  );
  await expect(
    page.getByText('E_VALUE: division by zero (line 4, column 14)', { exact: false }).first()
  ).toBeVisible();
  await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const { AutoSaveService } = await import('/src/services/autoSave/index.ts');
    await AutoSaveService.getInstance().flush(store.getState().notebookId);
  });
  await page.reload();
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const store = (await import('/src/store/notebookStore.ts')).default;
        return store
          .getState()
          .cells.find((cell) => cell.id === id)
          ?.outputs?.find((output) => output.metadata?.diagnostics)?.metadata;
      }, first.id)
    )
    .toEqual(committed.outputs[0].metadata);
  await expect(
    page.getByText('E_VALUE: division by zero (line 4, column 14)', { exact: false }).first()
  ).toBeVisible();
});
