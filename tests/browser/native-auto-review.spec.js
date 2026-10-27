import { test, expect } from '@playwright/test';
import process from 'node:process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeTestServer } from './support/nativeServer.js';

const binary = process.env.AAL_NATIVE_SERVER;
const target = process.env.AAL_NOTEBOOK_TARGET;
test.skip(!binary || !target, 'Explicit locally built Rust server and loopback target required');

test('native cell review waits, resumes its original invocation and replays a lost completed reply', async ({
  page,
}) => {
  test.setTimeout(120000);
  const requests = [];
  const provider = createServer(async (request, response) => {
    let bytes = '';
    for await (const chunk of request) bytes += chunk;
    requests.push(JSON.parse(bytes));
    response.setHeader('content-type', 'application/json');
    if (requests.length === 1) {
      response.writeHead(503);
      response.end('temporarily unavailable');
    } else {
      response.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  allow: true,
                  reason: 'Frozen housing measurement fixture',
                }),
              },
            },
          ],
        })
      );
    }
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const config = await mkdtemp(join(tmpdir(), 'aal-cell-review-browser-'));
  const path = join(config, 'review.json');
  await writeFile(
    join(config, 'routes.json'),
    JSON.stringify({
      engines: {
        review: {
          endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions`,
          model: 'fixture',
          timeout_ms: 1000,
        },
      },
    })
  );
  await writeFile(
    path,
    JSON.stringify({
      routes: 'routes.json',
      engine: 'review',
      policy:
        'Allow the explicitly frozen housing CSV calculation and first-query evidence projection.',
    })
  );
  const native = new NativeTestServer(binary, target);
  try {
    await native.start(undefined, path);
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
    await page.keyboard.press('Escape');
    const bodies = [];
    let completed;
    await page.route('**/aal-api/workspaces/*/execute', async (route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 2) {
        completed = await (await route.fetch()).json();
        await route.abort('failed');
      } else await route.continue();
    });
    const first = await page.evaluate(async () => {
      const store = (await import('/src/store/notebookStore.ts')).default;
      const cell = store.getState().cells.find((cell) => cell.id.startsWith('aal-evidence-'));
      store
        .getState()
        .updateCell(
          cell.id,
          cell.content.replace(
            'agent Cell is Agent\n',
            'agent Cell is Agent\n  behavior\n    permissions "auto"\n'
          )
        );
      const outcome = await store.getState().runSingleCell(cell.id);
      return {
        id: cell.id,
        outcome,
        outputs: store.getState().cells.find((c) => c.id === cell.id).outputs,
        pending: Object.keys(sessionStorage)
          .filter((k) => k.startsWith('aal-cell-pending:'))
          .map((k) => JSON.parse(sessionStorage.getItem(k))),
      };
    });
    expect(first.outcome.success).toBe(false);
    expect(first.outputs.some((output) => output.content.includes('等待自动审核'))).toBe(true);
    expect(first.pending).toEqual([bodies[0]]);
    expect(requests).toHaveLength(1);
    await native.stop();
    await native.start(undefined, path);
    await page.reload();
    await expect(page.getByRole('button', { name: '房屋研究', exact: true })).toBeEnabled();
    const unknown = await page.evaluate(async (id) => {
      const store = (await import('/src/store/notebookStore.ts')).default;
      return store.getState().runSingleCell(id);
    }, first.id);
    expect(unknown.success).toBe(false);
    expect(completed.status, JSON.stringify(completed)).toBe('ok');
    expect(requests).toHaveLength(6);
    expect(bodies[1]).toEqual(bodies[0]);
    await native.stop();
    await new Promise((resolve) => provider.close(resolve));
    await native.start();
    await page.reload();
    await expect(page.getByRole('button', { name: '房屋研究', exact: true })).toBeEnabled();
    const replay = await page.evaluate(async (id) => {
      const store = (await import('/src/store/notebookStore.ts')).default;
      const outcome = await store.getState().runSingleCell(id);
      return {
        outcome,
        outputs: store.getState().cells.find((c) => c.id === id)?.outputs,
        pending: Object.keys(sessionStorage).filter((k) => k.startsWith('aal-cell-pending:')),
      };
    }, first.id);
    expect(replay.outcome.success, JSON.stringify(replay.outcome)).toBe(true);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(replay.pending).toEqual([]);
    const proof = JSON.parse(replay.outputs[0].content);
    expect(proof).toEqual(JSON.parse(completed.outputs[0].content));
    expect(proof.comparison.rows[0].neighbors[0].row).toBe(2);
    expect(proof.sample_evidence.facts[0].source.invocation).toBe(bodies[0].invocation);
  } finally {
    await native.dispose();
    if (provider.listening) await new Promise((resolve) => provider.close(resolve));
    await rm(config, { recursive: true, force: true });
  }
});
