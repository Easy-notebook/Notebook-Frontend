import { test, expect } from '@playwright/test';
import process from 'node:process';
import { NativeTestServer } from './support/nativeServer.js';

// Explicit locally built Rust server; never uses a paired EasyNet daemon or model.
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

test('housing UI publishes reusable native cells, executes them and retains results on reload', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByLabel('数值特征（每行一个）').fill('area\nrooms');
  await page.getByLabel('分群数量', { exact: true }).fill('3');
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行房屋分群', exact: true })).toBeEnabled();
  await page.getByLabel('新样本 CSV').fill('area,rooms\n42.5,2\n182,7\n');
  await page.getByRole('button', { name: '插入可复用的拟合与比较单元格', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '已保存拟合与比较两个 AAL 单元格' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    await store.getState().runAllCells();
    return store
      .getState()
      .cells.filter((cell) => cell.metadata?.nativeSharedValue)
      .map((cell) => ({
        id: cell.id,
        language: cell.language,
        content: cell.content,
        outputs: cell.outputs,
      }));
  });
  expect(result).toHaveLength(2);
  expect(result[1].content).not.toContain('numeric_segments');
  const output = result[1].outputs.find((item) => item.content?.includes('"comparison"'));
  const measured = JSON.parse(output.content);
  expect(measured.comparison.rows[0].neighbors[0].row).toBe(2);
  expect(measured.comparison.rows[1].neighbors[0].row).toBe(10);
  expect(result[1].outputs.some((item) => item.content?.includes('producer invocation'))).toBe(
    true
  );
  await page.reload();
  await page.waitForFunction(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    return (
      !!store.getState().notebookId &&
      store.getState().cells.filter((cell) => cell.metadata?.nativeSharedValue).length === 2
    );
  });
  await expect(page.getByRole('button', { name: '房屋研究', exact: true })).toBeEnabled();
  const replay = await page.evaluate(async (id) => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const before = store.getState().notebookId;
    const outcome = await store.getState().runSingleCell(id);
    return {
      before,
      after: store.getState().notebookId,
      outcome,
      cell: store.getState().cells.find((cell) => cell.id === id),
    };
  }, result[1].id);
  expect(
    replay.outcome.success,
    JSON.stringify({ before: replay.before, after: replay.after, outcome: replay.outcome })
  ).toBe(true);
  expect(replay.cell.language).toBe('aal');
  expect(
    JSON.parse(replay.cell.outputs.find((item) => item.content?.includes('"comparison"')).content)
  ).toEqual(measured);
});

test('selected evidence rows stay independent after response loss and server restart', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: '新建房屋研究', exact: true }).click();
  await page.getByRole('button', { name: '房屋研究', exact: true }).click();
  await page
    .getByLabel('参考 CSV 内容')
    .fill(
      'area,rooms\n40,2\n41,2\n42,2\n43,2\n90,4\n91,4\n92,4\n93,4\n180,7\n181,7\n182,7\n183,7\n'
    );
  await page.getByLabel('数值特征（每行一个）').fill('area\nrooms');
  await page.getByLabel('分群数量', { exact: true }).fill('3');
  await page.getByRole('button', { name: '保存研究输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行房屋分群', exact: true })).toBeEnabled();
  await page.getByLabel('新样本 CSV').fill('area,rooms\n42.5,2\n182,7\n');
  await page.getByRole('button', { name: '插入 FoKn 样本证据单元格', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '已保存 FoKn 样本证据单元格' })
  ).toBeVisible();
  await page.getByLabel('证据样本行（从 0 开始）').fill('1');
  await page.getByRole('button', { name: '插入 FoKn 样本证据单元格', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '运行后查看查询行 1' })).toBeVisible();
  await page.keyboard.press('Escape');
  const rowZero = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const cells = store.getState().cells.filter((cell) => cell.id.startsWith('aal-evidence-'));
    if (cells.length !== 2) throw new Error('Expected independent row cells');
    const cell = cells.find((cell) => cell.content.includes('comparison, 0)'));
    const outcome = await store.getState().runSingleCell(cell.id);
    return {
      id: cell.id,
      outcome,
      outputs: store.getState().cells.find((item) => item.id === cell.id).outputs,
    };
  });
  expect(rowZero.outcome.success).toBe(true);
  const firstProof = JSON.parse(rowZero.outputs[0].content);
  expect(firstProof.sample_evidence.observation.query_row).toBe(0);
  expect(firstProof.sample_evidence.observation.neighbor_0_row).toBe(2);
  let committed;
  let request;
  await page.route(
    '**/aal-api/workspaces/*/execute',
    async (route) => {
      request = route.request().postDataJSON();
      committed = await (await route.fetch()).json();
      await route.abort('failed');
    },
    { times: 1 }
  );
  const first = await page.evaluate(async () => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const cell = store
      .getState()
      .cells.find(
        (cell) => cell.id.startsWith('aal-evidence-') && cell.content.includes('comparison, 1)')
      );
    return { id: cell.id, outcome: await store.getState().runSingleCell(cell.id) };
  });
  expect(first.outcome.success).toBe(false);
  expect(committed.status, JSON.stringify(committed)).toBe('ok');
  const measured = JSON.parse(committed.outputs[0].content);
  expect(first.id).not.toBe(rowZero.id);
  expect(measured.sample_evidence.observation.query_row).toBe(1);
  expect(measured.sample_evidence.observation.neighbor_0_row).toBe(10);
  expect(measured.sample_evidence.facts).toHaveLength(4);
  expect(measured.sample_evidence.answers).toHaveLength(3);
  expect(measured.sample_evidence.graphs).toHaveLength(3);
  for (const fact of measured.sample_evidence.facts) {
    expect(fact.status).toBe('supported');
    expect(fact.atom.terms[1].literal).toBe(1);
    expect(fact.source.invocation).toBe(request.invocation);
  }
  for (const answer of measured.sample_evidence.answers) {
    const terms = answer.atom.terms;
    expect(terms[1].literal).toBe(1);
    const neighbor = measured.comparison.rows[1].neighbors.find((n) => n.row === terms[3].literal);
    expect(neighbor.distance_squared).toBe(terms[6].literal);
    expect(terms[4].literal).toBe(measured.comparison.rows[1].assignment.cluster);
  }
  await native.stop();
  await native.start();
  await page.reload();
  await page.waitForFunction(async (id) => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    return !!store.getState().cells.find((cell) => cell.id === id);
  }, first.id);
  // Wait for editor restoration, not only the transient persisted store snapshot.
  await expect(page.getByRole('button', { name: '房屋研究', exact: true })).toBeEnabled();
  let replayRequest;
  let executionRetries = 0;
  await page.route('**/aal-api/workspaces/*/execute', async (route) => {
    executionRetries++;
    await route.abort('failed');
  });
  await page.route(
    '**/aal-api/workspaces/*/executions/lookup',
    async (route) => {
      replayRequest = route.request().postDataJSON();
      await route.continue();
    },
    { times: 1 }
  );
  const replay = await page.evaluate(async (id) => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    const before = store.getState().notebookId;
    const outcome = await store.getState().runSingleCell(id);
    return {
      before,
      after: store.getState().notebookId,
      outcome,
      outputs: store.getState().cells.find((cell) => cell.id === id)?.outputs,
    };
  }, first.id);
  expect(replay.outcome.success, JSON.stringify(replay.outcome)).toBe(true);
  expect(replayRequest).toEqual(request);
  expect(executionRetries).toBe(0);
  expect(JSON.parse(replay.outputs[0].content)).toEqual(measured);
  const retainedZero = await page.evaluate(async (id) => {
    const store = (await import('/src/store/notebookStore.ts')).default;
    return store.getState().cells.find((cell) => cell.id === id).outputs;
  }, rowZero.id);
  expect(JSON.parse(retainedZero[0].content)).toEqual(firstProof);
});
